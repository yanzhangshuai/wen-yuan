/**
 * 关系级幻觉定向抽样（Pass4 例外审核流）。
 *
 * 依据架构 doc §7.4：证据锚定只证"名字在正文"，不证"关系/事件为真"。
 * 两类幻觉能穿过锚定：真实实体 + 捏造关系 / 捏造传记事件。
 * 兜底 = 定向抽样——证据单薄的关系边 + 新实体率高的分片 → 进跨模型复核/人审。
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { HALLUCINATION_HIGH_NEW_ENTITY_RATE, HALLUCINATION_THIN_EVIDENCE_CHARS } from "./config";

export interface HallucinationSample {
  factId    : string;
  evidence  : string;
  reason    : "thin_evidence" | "high_new_entity_rate";
  sourceName: string | null;
  targetName: string | null;
}

/**
 * 功能：对某本书的 DRAFT RELATION 事实做关系级幻觉定向抽样。
 * 输入：bookId、最大抽样数。
 * 输出：证据单薄或高新实体率分片中的样本事实。
 * 异常：数据库异常向上抛出。
 * 副作用：只读查询。
 */
export async function sampleRelationHallucination(
  bookId: string,
  maxSamples = 20,
  prismaClient: PrismaClient = prisma
): Promise<HallucinationSample[]> {
  const facts = await prismaClient.fact.findMany({
    where: {
      bookId,
      status  : "DRAFT",
      factType: "RELATION"
    },
    select: {
      id          : true,
      evidence    : true,
      sourceEntity: { select: { name: true } },
      targetEntity: { select: { name: true } }
    },
    orderBy: [{ evidence: "asc" }, { id: "asc" }],
    take   : 200
  });

  const samples: HallucinationSample[] = [];

  for (const fact of facts) {
    if (samples.length >= maxSamples) {
      break;
    }

    // 证据单薄：evidence 字符数低于阈值。
    if (fact.evidence.length < HALLUCINATION_THIN_EVIDENCE_CHARS) {
      samples.push({
        factId    : fact.id,
        evidence  : fact.evidence,
        reason    : "thin_evidence",
        sourceName: fact.sourceEntity?.name ?? null,
        targetName: fact.targetEntity?.name ?? null
      });
    }
  }

  return samples;
}

/**
 * 功能：估算某本书分片的新实体率（新实体事实占比）是否达"高新实体率"阈值。
 * 输入：bookId。
 * 输出：新实体率（0-1）；用于判定是否定向抽样整本书分片。
 * 异常：数据库异常向上抛出。
 * 副作用：只读查询。
 */
export async function estimateNewEntityRate(
  bookId: string,
  prismaClient: PrismaClient = prisma
): Promise<number> {
  const [total, newEntityFacts] = await Promise.all([
    prismaClient.fact.count({ where: { bookId, status: "DRAFT" } }),
    prismaClient.fact.count({
      where: {
        bookId,
        status      : "DRAFT",
        sourceEntity: { is: null }
      }
    })
  ]);
  return total > 0 ? newEntityFacts / total : 0;
}

/** 判定新实体率是否达到"高新实体率"定向抽样阈值。 */
export function isHighNewEntityRate(rate: number): boolean {
  return rate >= HALLUCINATION_HIGH_NEW_ENTITY_RATE;
}
