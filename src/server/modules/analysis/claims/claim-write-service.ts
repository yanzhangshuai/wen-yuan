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
