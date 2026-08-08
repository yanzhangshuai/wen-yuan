/**
 * 身份 Pass（v6 核心，替代 v5 的 Tier1 原文枚举登记表）
 *
 * 职责：把 Pass1 提取产出的"全书去重表面形式名单"折叠为规范实体。
 *  输入 = 表面形式（实体名 + 提及频次 + 类型）
 *  输出 = { canonical → aliases } 映射 + dropped（一次性称呼）
 *
 * 为什么是正确上下文（架构依据：docs/architecture/14-agent-architecture-v6.md §4）：
 * - 输入是紧凑名单（~10-15K token），不是 30 万字原文；
 * - 模型一眼看到全部变体两端（范进/范老爷/范学道同屏），合并从"跨章检索"
 *   降为"名单分类"，消除 v5 过度列举的结构性来源；
 * - 按类型分组各一次调用，互不干扰（对齐长文档 KG 构建的主流分解）。
 *
 * 输出消费方：projection（确定性归并：临时实体 → canonical，facts/mentions 重指向）。
 */
import { prisma } from "@/server/db/prisma";
import type { EntityTypeStr } from "@/server/modules/extraction/types";
import { callIdentityLlm } from "./llm.ts";
import { IDENTITY_CANONICALIZATION_SYSTEM_PROMPT } from "./prompts.ts";
import { normalizeRegistryName } from "./registry.ts";

/** 参与身份折叠的实体类型（CONCEPT 多为泛概念，不参与实体归并）。 */
const FOLD_TYPES: EntityTypeStr[] = ["PERSON", "LOCATION", "ORGANIZATION"];

/** 单次身份调用的最大名单长度（超长则按类型再分片；儒林外史规模单次足够）。 */
const MAX_NAMES_PER_CALL = 1500;
/** 身份调用输出预算：折叠后实体 ~200-400 条，16K 余量充足。 */
const IDENTITY_MAX_OUTPUT_TOKENS = 16_384;

/** 身份 Pass 输出的一个规范实体组。 */
export interface CanonicalGroup {
  canonical: string;
  aliases  : string[];
  type     : EntityTypeStr;
}

export interface IdentityPassInput {
  bookId    : string;
  jobId     : string;
  /** Pass 的 agent_run id（审计外键必须真实存在）。 */
  agentRunId: string;
}

export interface IdentityPassResult {
  /** 规范实体组（canonical 必为名单中的某个表面形式）。 */
  groups      : CanonicalGroup[];
  /** 判定为一次性/泛称的表面形式（保留低置信实体，走 markOrphan）。 */
  dropped     : string[];
  /** 本次覆盖的全部表面形式（= 提取产出去重名单）。 */
  surfaceForms: string[];
}

/** 单次身份调用的模型输出（canonical 折叠）。 */
interface CanonicalizationOutput {
  entities: Array<{ canonical: string; aliases: string[] }>;
  dropped : string[];
}

/** 由表面形式（含频次）构造身份调用 user prompt。 */
export function buildIdentityUserPrompt(
  type: EntityTypeStr,
  surfaceForms: Array<{ name: string; count: number }>,
  skills?: string[]
): string {
  const lines = surfaceForms.map((s) => `${s.name}(${s.count}次)`).join("\n");
  const parts = [
    `需折叠的表面形式名单（提及频次），类型 ${type}：`,
    "",
    lines,
    "",
    "输出折叠后的规范实体 JSON。"
  ];
  if (skills?.length) {
    parts.push("", "相关领域知识：", ...skills);
  }
  return parts.join("\n");
}

/**
 * 运行身份 Pass：查询全书去重表面形式 → 按类型折叠 → 校验输出。
 * @throws 任一类型调用失败时抛错（由 AiCallExecutor 统一重试）。
 */
export async function runIdentityPass(input: IdentityPassInput): Promise<IdentityPassResult> {
  // 1) 提取产出去重表面形式（含提及频次；实体经本书 profile 关联）
  const entities = await prisma.entity.findMany({
    where: {
      profiles : { some: { bookId: input.bookId, deletedAt: null } },
      deletedAt: null
    },
    select: {
      name      : true,
      entityType: true,
      _count    : { select: { mentions: { where: { deletedAt: null, status: { not: "REJECTED" } } } } }
    }
  });

  const byType = new Map<EntityTypeStr, Array<{ name: string; count: number }>>();
  for (const e of entities) {
    const type = e.entityType as EntityTypeStr;
    if (!FOLD_TYPES.includes(type)) {
      continue;
    }
    const list = byType.get(type) ?? [];
    list.push({ name: e.name, count: e._count.mentions });
    byType.set(type, list);
  }

  const groups: CanonicalGroup[] = [];
  const dropped: string[] = [];
  const surfaceForms: string[] = [];

  for (const type of FOLD_TYPES) {
    const list = byType.get(type);
    if (!list?.length) {
      continue;
    }
    surfaceForms.push(...list.map((s) => s.name));

    // 超长名单分片调用（同名 canonical 由合并阶段去重）
    for (let i = 0; i < list.length; i += MAX_NAMES_PER_CALL) {
      const chunk = list.slice(i, i + MAX_NAMES_PER_CALL);
      const { data } = await callIdentityLlm<CanonicalizationOutput>({
        stage          : "IDENTITY_CANONICALIZATION",
        system         : IDENTITY_CANONICALIZATION_SYSTEM_PROMPT,
        user           : buildIdentityUserPrompt(type, chunk),
        jobId          : input.jobId,
        maxOutputTokens: IDENTITY_MAX_OUTPUT_TOKENS,
        // 关闭思考：名单分类是确定性任务，推理模型会吃掉输出预算。
        enableThinking : false
      });

      const normalizedInput = new Map<string, string>();
      for (const s of chunk) {
        normalizedInput.set(normalizeRegistryName(s.name), s.name);
      }

      // 2) 校验：canonical/aliases/dropped 必须都是输入名单中的表面形式（归一化后）
      const resolved = resolveOutput(data, normalizedInput, type);
      groups.push(...resolved.groups);
      dropped.push(...resolved.dropped);
    }
  }

  return { groups, dropped, surfaceForms };
}

/** 把模型输出解析为合法 group（canonical 不在名单 → 整组丢弃，宁可不合并、不乱合并）。 */
function resolveOutput(
  data: CanonicalizationOutput,
  inputNames: Map<string, string>,
  type: EntityTypeStr
): { groups: CanonicalGroup[]; dropped: string[] } {
  const groups: CanonicalGroup[] = [];
  const used = new Set<string>();

  for (const ent of data.entities ?? []) {
    const canonical = inputNames.get(normalizeRegistryName(ent.canonical ?? "")) ?? "";
    if (!canonical || used.has(canonical)) {
      continue;
    }
    used.add(canonical);

    const aliases: string[] = [];
    for (const a of ent.aliases ?? []) {
      const name = inputNames.get(normalizeRegistryName(a));
      if (!name || name === canonical || used.has(name)) {
        continue;
      }
      aliases.push(name);
      used.add(name);
    }
    groups.push({ canonical, aliases, type });
  }

  // 未覆盖的表面形式 → 一次性/未归属（保留低置信实体，走 markOrphan/人审；不参与归并）
  const dropped = Array.from(inputNames.values()).filter((n) => !used.has(n));

  return { groups, dropped };
}
