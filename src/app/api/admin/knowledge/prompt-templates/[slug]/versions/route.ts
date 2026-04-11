import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { createPromptVersion } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, createVersionSchema } from "../../../_shared";

const PATH = "/api/admin/knowledge/prompt-templates/[slug]/versions";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const { slug } = await context.params;

    const parsed = createVersionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await createPromptVersion(slug, { ...parsed.data, createdBy: auth.userId ?? undefined });
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_VERSION_CREATED", message: "版本创建成功", data, status: 201 });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "版本创建失败" });
  }
}
