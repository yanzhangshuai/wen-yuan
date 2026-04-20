import { prisma } from "@/server/db/prisma";
import type { StageAPlusRelationClaimRow } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

interface StageAPlusRelationClaimDelegate {
  findMany(args: {
    where: {
      bookId            : string;
      chapterId         : string;
      runId             : string;
      source            : "AI";
      derivedFromClaimId: null;
    };
    orderBy: { createdAt: "asc" };
    select : Record<keyof StageAPlusRelationClaimRow, true>;
  }): Promise<StageAPlusRelationClaimRow[]>;
}

export interface StageAPlusRepositoryClient {
  relationClaim: StageAPlusRelationClaimDelegate;
}

export function createStageAPlusRepository(
  client: StageAPlusRepositoryClient = prisma
) {
  async function listStageARelationClaims(input: {
    bookId   : string;
    chapterId: string;
    runId    : string;
  }): Promise<StageAPlusRelationClaimRow[]> {
    return client.relationClaim.findMany({
      where: {
        bookId            : input.bookId,
        chapterId         : input.chapterId,
        runId             : input.runId,
        source            : "AI",
        derivedFromClaimId: null
      },
      orderBy: { createdAt: "asc" },
      select : {
        id                      : true,
        bookId                  : true,
        chapterId               : true,
        sourceMentionId         : true,
        targetMentionId         : true,
        sourcePersonaCandidateId: true,
        targetPersonaCandidateId: true,
        relationTypeKey         : true,
        relationLabel           : true,
        relationTypeSource      : true,
        direction               : true,
        effectiveChapterStart   : true,
        effectiveChapterEnd     : true,
        timeHintId              : true,
        evidenceSpanIds         : true,
        confidence              : true
      }
    });
  }

  return { listStageARelationClaims };
}

export type StageAPlusRepository = ReturnType<typeof createStageAPlusRepository>;

export const stageAPlusRepository = createStageAPlusRepository();
