import type {
  StageBAliasClaimRow,
  StageBAliasSignalBundle
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

interface ParsedReviewNote {
  prefix     : string;
  knowledgeId: string | null;
  fields     : Record<string, string>;
}

const ACTIVE_ALIAS_SIGNAL_STATES = new Set<StageBAliasClaimRow["reviewState"]>([
  "PENDING",
  "ACCEPTED",
  "CONFLICTED"
]);

function isActiveAliasSignalState(reviewState: StageBAliasClaimRow["reviewState"]): boolean {
  return ACTIVE_ALIAS_SIGNAL_STATES.has(reviewState);
}

function parseReviewNoteFields(reviewNote: string | null): ParsedReviewNote | null {
  if (!reviewNote) {
    return null;
  }

  const colonIndex = reviewNote.indexOf(":");
  if (colonIndex < 0) {
    return null;
  }

  const prefix = reviewNote.slice(0, colonIndex).trim();
  const detail = reviewNote.slice(colonIndex + 1);
  const fields: Record<string, string> = {};
  let knowledgeId: string | null = null;

  for (const token of detail.split(";")) {
    const trimmed = token.trim();
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();
    if (!value) {
      continue;
    }

    if (key === "knowledgeId") {
      knowledgeId = value;
      continue;
    }

    fields[key] = value;
  }

  return { prefix, knowledgeId, fields };
}

function splitBlockedCanonicalNames(raw: string): string[] {
  return raw
    .split("|")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

export function collectStageBAliasSignals(
  aliasClaims: StageBAliasClaimRow[]
): StageBAliasSignalBundle {
  const positiveSignals: StageBAliasSignalBundle["positiveSignals"] = [];
  const negativeSignals: StageBAliasSignalBundle["negativeSignals"] = [];
  const impersonationAliasTexts = new Set<string>();
  const misidentifiedAliasTexts = new Set<string>();

  for (const claim of aliasClaims) {
    if (!isActiveAliasSignalState(claim.reviewState)) {
      continue;
    }

    if (claim.claimKind === "IMPERSONATES") {
      impersonationAliasTexts.add(claim.aliasText);
      continue;
    }

    if (claim.claimKind === "MISIDENTIFIED_AS") {
      misidentifiedAliasTexts.add(claim.aliasText);
      continue;
    }

    const parsed = parseReviewNoteFields(claim.reviewNote);
    if (!parsed) {
      continue;
    }

    if (
      (parsed.prefix === "KB_VERIFIED" || parsed.prefix === "KB_PENDING_HINT")
      && parsed.fields.aliasText
      && parsed.fields.canonicalName
    ) {
      positiveSignals.push({
        aliasText      : parsed.fields.aliasText,
        canonicalName  : parsed.fields.canonicalName,
        knowledgeId    : parsed.knowledgeId,
        reviewStrength : parsed.prefix === "KB_VERIFIED" ? "VERIFIED" : "PENDING",
        confidence     : claim.confidence,
        evidenceSpanIds: claim.evidenceSpanIds
      });
      continue;
    }

    if (
      parsed.prefix === "KB_ALIAS_NEGATIVE"
      && parsed.fields.aliasText
      && parsed.fields.blockedCanonicalNames
    ) {
      negativeSignals.push({
        aliasText            : parsed.fields.aliasText,
        blockedCanonicalNames: splitBlockedCanonicalNames(parsed.fields.blockedCanonicalNames),
        knowledgeId          : parsed.knowledgeId,
        confidence           : claim.confidence,
        evidenceSpanIds      : claim.evidenceSpanIds
      });
    }
  }

  return {
    positiveSignals,
    negativeSignals,
    impersonationAliasTexts,
    misidentifiedAliasTexts
  };
}
