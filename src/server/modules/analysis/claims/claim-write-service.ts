import type {
  ClaimCreateDataByFamily,
  ClaimDraftByFamily,
  ClaimFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import {
  toClaimCreateData,
  validateClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import type {
  ClaimWriteScope,
  ReplaceClaimFamilyScopeResult
} from "@/server/modules/analysis/claims/claim-repository";

export interface ClaimWriteRepository {
  replaceClaimFamilyScope<TFamily extends ClaimFamily>(input: {
    family: TFamily;
    scope : ClaimWriteScope;
    rows  : ClaimCreateDataByFamily[TFamily][];
  }): Promise<ReplaceClaimFamilyScopeResult>;
}

export interface WriteClaimBatchInput<TFamily extends ClaimFamily> {
  family: TFamily;
  scope : ClaimWriteScope;
  drafts: unknown[];
}

export class ClaimWriteServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimWriteServiceError";
  }
}

function getDraftChapterId<TFamily extends ClaimFamily>(draft: ClaimDraftByFamily[TFamily]): string | null {
  return "chapterId" in draft ? (draft.chapterId ?? null) : null;
}

function getExpectedStageScopedSource(
  family: ClaimFamily,
  scope: ClaimWriteScope
): "RULE" | null {
  if (scope.stageKey !== "stage_a_plus_knowledge_recall") {
    return null;
  }

  switch (family) {
    case "ENTITY_MENTION":
    case "ALIAS":
    case "EVENT":
    case "RELATION":
    case "TIME":
      return "RULE";
    default:
      return null;
  }
}

function assertDraftMatchesScope<TFamily extends ClaimFamily>(
  family: TFamily,
  scope: ClaimWriteScope,
  draft: ClaimDraftByFamily[TFamily]
): void {
  if (draft.bookId !== scope.bookId) {
    throw new ClaimWriteServiceError(
      `Claim batch bookId mismatch for ${family}: ${draft.bookId} !== ${scope.bookId}`
    );
  }

  if (draft.runId !== scope.runId) {
    throw new ClaimWriteServiceError(
      `Claim batch runId mismatch for ${family}: ${draft.runId} !== ${scope.runId}`
    );
  }

  if (getDraftChapterId(draft) !== (scope.chapterId ?? null)) {
    throw new ClaimWriteServiceError(
      `Claim batch chapterId mismatch for ${family}: ${getDraftChapterId(draft)} !== ${scope.chapterId ?? null}`
    );
  }

  if (draft.source === "MANUAL") {
    throw new ClaimWriteServiceError(
      `Pipeline claim writes must not use MANUAL source for ${family}`
    );
  }

  const expectedSource = getExpectedStageScopedSource(family, scope);

  if (expectedSource !== null && draft.source !== expectedSource) {
    throw new ClaimWriteServiceError(
      `Claim batch source mismatch for ${family} at ${scope.stageKey}: expected ${expectedSource}, got ${draft.source}`
    );
  }
}

export function createClaimWriteService(repository: ClaimWriteRepository) {
  return {
    async writeClaimBatch<TFamily extends ClaimFamily>(
      input: WriteClaimBatchInput<TFamily>
    ): Promise<ReplaceClaimFamilyScopeResult> {
      const validatedDrafts = input.drafts.map((draft) =>
        validateClaimDraftByFamily(input.family, draft)
      );

      validatedDrafts.forEach((draft) => assertDraftMatchesScope(input.family, input.scope, draft));

      return repository.replaceClaimFamilyScope({
        family: input.family,
        scope : input.scope,
        rows  : validatedDrafts.map((draft) => toClaimCreateData(draft))
      });
    }
  };
}
