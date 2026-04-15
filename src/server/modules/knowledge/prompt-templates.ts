import { prisma } from "@/server/db/prisma";

/**
 * 提示词模板管理服务。
 */

export interface ResolvedPromptTemplate {
  system    : string;
  user      : string;
  versionId?: string;
  versionNo?: number;
  codeRef?  : string | null;
}

function applyTemplateReplacements(template: string, replacements?: Record<string, string>): string {
  if (!replacements) {
    return template;
  }

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

function shouldBypassRuntimePromptLookup() {
  // 测试场景只需要稳定验证 fallback 提示词契约，不应隐式触发真实数据库读取。
  return process.env.NODE_ENV === "test";
}

async function findRuntimePromptVersion(slug: string, bookTypeId?: string | null) {
  const template = await prisma.promptTemplate.findUnique({
    where : { slug },
    select: {
      id     : true,
      codeRef: true
    }
  });

  if (!template) {
    return null;
  }

  if (bookTypeId) {
    const bookTypeVersion = await prisma.promptTemplateVersion.findFirst({
      where: {
        templateId: template.id,
        bookTypeId
      },
      orderBy: { versionNo: "desc" }
    });

    if (bookTypeVersion) {
      return { template, version: bookTypeVersion };
    }
  }

  // 找到该模板激活版本（isActive=true）
  const activeVersion = await prisma.promptTemplateVersion.findFirst({
    where: {
      templateId: template.id,
      isActive  : true,
      bookTypeId: null
    },
    orderBy: { versionNo: "desc" }
  });

  if (activeVersion) {
    return { template, version: activeVersion };
  }

  const fallbackVersion = await prisma.promptTemplateVersion.findFirst({
    where: {
      templateId: template.id,
      bookTypeId: null
    },
    orderBy: { versionNo: "desc" }
  });

  if (!fallbackVersion) {
    return null;
  }

  return { template, version: fallbackVersion };
}

export async function listPromptTemplates() {
  return prisma.promptTemplate.findMany({
    orderBy: { slug: "asc" },
    include: {
      versions: {
        orderBy: { createdAt: "desc" },
        take   : 1,
        select : { id: true, versionNo: true, createdAt: true, changeNote: true }
      }
    }
  });
}

export async function getPromptTemplate(slug: string) {
  return prisma.promptTemplate.findUnique({
    where  : { slug },
    include: {
      versions: {
        orderBy: { versionNo: "desc" },
        select : {
          id          : true,
          versionNo   : true,
          systemPrompt: true,
          userPrompt  : true,
          bookTypeId  : true,
          changeNote  : true,
          createdBy   : true,
          isBaseline  : true,
          createdAt   : true
        }
      }
    }
  });
}

export async function createPromptVersion(
  slug: string,
  data: {
    systemPrompt: string;
    userPrompt  : string;
    bookTypeId? : string;
    changeNote? : string;
    createdBy?  : string;
    isBaseline? : boolean;
  }
) {
  const template = await prisma.promptTemplate.findUnique({
    where  : { slug },
    include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } }
  });
  if (!template) throw new Error(`模板 ${slug} 不存在`);

  const nextVersionNo = (template.versions[0]?.versionNo ?? 0) + 1;

  return prisma.promptTemplateVersion.create({
    data: {
      templateId  : template.id,
      versionNo   : nextVersionNo,
      systemPrompt: data.systemPrompt,
      userPrompt  : data.userPrompt,
      bookTypeId  : data.bookTypeId,
      changeNote  : data.changeNote,
      createdBy   : data.createdBy,
      isBaseline  : data.isBaseline ?? false
    }
  });
}

export async function activatePromptVersion(slug: string, versionId: string) {
  const template = await prisma.promptTemplate.findUnique({ where: { slug } });
  if (!template) throw new Error(`模板 ${slug} 不存在`);

  // 验证 version 属于此模板
  const version = await prisma.promptTemplateVersion.findUnique({ where: { id: versionId } });
  if (!version || version.templateId !== template.id) {
    throw new Error("版本不属于该模板");
  }

  // 停用同 bookType 组合的旧激活版本，激活新版本
  await prisma.$transaction([
    prisma.promptTemplateVersion.updateMany({
      where: {
        templateId: template.id,
        bookTypeId: version.bookTypeId,
        isActive  : true
      },
      data: { isActive: false }
    }),
    prisma.promptTemplateVersion.update({
      where: { id: versionId },
      data : { isActive: true }
    })
  ]);

  return version;
}

export async function diffPromptVersions(slug: string, v1: string, v2: string) {
  const [ver1, ver2] = await Promise.all([
    prisma.promptTemplateVersion.findUnique({ where: { id: v1 } }),
    prisma.promptTemplateVersion.findUnique({ where: { id: v2 } })
  ]);

  if (!ver1 || !ver2) throw new Error("指定版本不存在");

  return {
    v1: { id: ver1.id, versionNo: ver1.versionNo, systemPrompt: ver1.systemPrompt, userPrompt: ver1.userPrompt },
    v2: { id: ver2.id, versionNo: ver2.versionNo, systemPrompt: ver2.systemPrompt, userPrompt: ver2.userPrompt }
  };
}

export async function previewPrompt(
  slug: string,
  versionId?: string,
  sampleInput?: Record<string, string>
) {
  const template = await prisma.promptTemplate.findUnique({ where: { slug } });
  if (!template) throw new Error(`模板 ${slug} 不存在`);

  let version;
  if (versionId) {
    version = await prisma.promptTemplateVersion.findUnique({ where: { id: versionId } });
  } else {
    // 找激活版本
    version = await prisma.promptTemplateVersion.findFirst({
      where  : { templateId: template.id, isActive: true, bookTypeId: null },
      orderBy: { versionNo: "desc" }
    });
  }

  if (!version) {
    return { systemPrompt: "(未配置版本，使用代码默认提示词)", userPrompt: "", codeRef: template.codeRef };
  }

  let system = version.systemPrompt;
  let user = version.userPrompt;

  if (sampleInput) {
    for (const [key, value] of Object.entries(sampleInput)) {
      system = system.replaceAll(`{${key}}`, value);
      user = user.replaceAll(`{${key}}`, value);
    }
  }

  return { systemPrompt: system, userPrompt: user, versionNo: version.versionNo };
}

export async function resolvePromptTemplateOrFallback(input: {
  slug         : string;
  bookTypeId?  : string | null;
  replacements?: Record<string, string>;
  fallback     : { system: string; user: string };
}): Promise<ResolvedPromptTemplate> {
  if (shouldBypassRuntimePromptLookup()) {
    return input.fallback;
  }

  try {
    const resolved = await findRuntimePromptVersion(input.slug, input.bookTypeId);
    if (!resolved) {
      return input.fallback;
    }

    return {
      system   : applyTemplateReplacements(resolved.version.systemPrompt, input.replacements),
      user     : applyTemplateReplacements(resolved.version.userPrompt, input.replacements),
      versionId: resolved.version.id,
      versionNo: resolved.version.versionNo,
      codeRef  : resolved.template.codeRef
    };
  } catch (error) {
    console.warn("[knowledge.prompt-templates] runtime resolve failed, using fallback", {
      slug      : input.slug,
      bookTypeId: input.bookTypeId ?? null,
      message   : error instanceof Error ? error.message : String(error)
    });
    return input.fallback;
  }
}
