import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type {
  AnalysisReviewOutputWriter,
  ReviewOutputWriterResult
} from "@/server/modules/analysis/review-output/types";

interface CountDelegate {
  count(args: { where: { bookId: string; runId: string } }): Promise<number>;
}

interface ThreeStageReviewOutputPrisma {
  personaCandidate       : CountDelegate;
  eventClaim             : CountDelegate;
  relationClaim          : CountDelegate;
  timeClaim              : CountDelegate;
  identityResolutionClaim: CountDelegate;
}

export function createThreeStageReviewOutputWriter(
  prismaClient: PrismaClient = prisma
): AnalysisReviewOutputWriter {
  const db = prismaClient as unknown as ThreeStageReviewOutputPrisma;

  return {
    architecture: "threestage",
    async write(input): Promise<ReviewOutputWriterResult> {
      if (input.architecture !== "threestage") {
        throw new Error(`ThreeStage review output writer received architecture ${input.architecture}`);
      }

      const where = { bookId: input.bookId, runId: input.runId };
      const [
        personaCandidates,
        eventClaims,
        relationClaims,
        timeClaims,
        identityResolutionClaims
      ] = await Promise.all([
        db.personaCandidate.count({ where }),
        db.eventClaim.count({ where }),
        db.relationClaim.count({ where }),
        db.timeClaim.count({ where }),
        db.identityResolutionClaim.count({ where })
      ]);

      if (personaCandidates === 0) {
        throw new Error("ThreeStage review output is missing persona_candidates");
      }
      if (identityResolutionClaims === 0) {
        throw new Error("ThreeStage review output is missing identity_resolution_claims");
      }
      if (eventClaims + relationClaims + timeClaims === 0) {
        throw new Error("ThreeStage review output is missing reviewable claims");
      }

      return {
        architecture           : "threestage",
        personaCandidates,
        entityMentions         : 0,
        eventClaims,
        relationClaims,
        identityResolutionClaims,
        timeClaims,
        validatedExistingClaims: eventClaims + relationClaims + timeClaims + identityResolutionClaims
      };
    }
  };
}
