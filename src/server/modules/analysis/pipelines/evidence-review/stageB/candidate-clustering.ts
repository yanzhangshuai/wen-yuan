import { collectStageBAliasSignals } from "@/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts";
import type {
  StageBAliasClaimRow,
  StageBBlockReason,
  StageBCandidateCluster,
  StageBMentionRow,
  StageBSupportReason
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

interface AliasSignalIndexes {
  positiveByAliasText     : Map<string, ReturnType<typeof collectStageBAliasSignals>["positiveSignals"]>;
  blockedCanonicalsByAlias: Map<string, Set<string>>;
  impersonationAliasTexts : Set<string>;
  misidentifiedAliasTexts : Set<string>;
}

interface MentionClusterSignals {
  canonicalHints        : string[];
  supportReasons        : StageBSupportReason[];
  blockReasons          : StageBBlockReason[];
  supportEvidenceSpanIds: string[];
}

interface CandidateClusterAccumulator {
  mentions              : StageBMentionRow[];
  canonicalHints        : string[];
  supportReasons        : Set<StageBSupportReason>;
  blockReasons          : Set<StageBBlockReason>;
  supportEvidenceSpanIds: Set<string>;
}

function normalizeSurfaceText(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function isExactNamedMergeEligible(mention: StageBMentionRow): boolean {
  return mention.mentionKind === "NAMED" || mention.mentionKind === "COURTESY_NAME";
}

function averageConfidence(mentions: StageBMentionRow[]): number {
  if (mentions.length === 0) {
    return 0;
  }

  return Number(
    (mentions.reduce((sum, mention) => sum + mention.confidence, 0) / mentions.length).toFixed(4)
  );
}

function sortMentions(mentions: StageBMentionRow[]): StageBMentionRow[] {
  return [...mentions].sort(
    (left, right) => left.chapterNo - right.chapterNo || left.id.localeCompare(right.id)
  );
}

function buildAliasSignalIndexes(aliasClaims: StageBAliasClaimRow[]): AliasSignalIndexes {
  const signals = collectStageBAliasSignals(aliasClaims);
  const positiveByAliasText = new Map<string, typeof signals.positiveSignals>();
  const blockedCanonicalsByAlias = new Map<string, Set<string>>();

  for (const signal of signals.positiveSignals) {
    const aliasKey = normalizeSurfaceText(signal.aliasText);
    const current = positiveByAliasText.get(aliasKey) ?? [];
    current.push(signal);
    positiveByAliasText.set(aliasKey, current);
  }

  for (const signal of signals.negativeSignals) {
    const aliasKey = normalizeSurfaceText(signal.aliasText);
    const current = blockedCanonicalsByAlias.get(aliasKey) ?? new Set<string>();

    for (const canonicalName of signal.blockedCanonicalNames) {
      current.add(normalizeSurfaceText(canonicalName));
    }

    blockedCanonicalsByAlias.set(aliasKey, current);
  }

  return {
    positiveByAliasText,
    blockedCanonicalsByAlias,
    impersonationAliasTexts: new Set(
      Array.from(signals.impersonationAliasTexts).map(normalizeSurfaceText)
    ),
    misidentifiedAliasTexts: new Set(
      Array.from(signals.misidentifiedAliasTexts).map(normalizeSurfaceText)
    )
  };
}

function collectMentionSignals(
  mention: StageBMentionRow,
  indexes: AliasSignalIndexes
): MentionClusterSignals {
  const surfaceKey = normalizeSurfaceText(mention.surfaceText);
  const blockedCanonicals = indexes.blockedCanonicalsByAlias.get(surfaceKey) ?? new Set<string>();
  const positiveSignals = indexes.positiveByAliasText.get(surfaceKey) ?? [];
  const canonicalHints: string[] = [];
  const supportReasons = new Set<StageBSupportReason>();
  const blockReasons = new Set<StageBBlockReason>();
  const supportEvidenceSpanIds = new Set<string>();

  if (blockedCanonicals.size > 0) {
    blockReasons.add("NEGATIVE_ALIAS_RULE");
  }

  if (mention.identityClaim === "IMPERSONATING" || indexes.impersonationAliasTexts.has(surfaceKey)) {
    blockReasons.add("IMPERSONATION");
  }

  if (indexes.misidentifiedAliasTexts.has(surfaceKey)) {
    blockReasons.add("MISIDENTIFICATION");
  }

  for (const signal of positiveSignals) {
    if (blockedCanonicals.has(normalizeSurfaceText(signal.canonicalName))) {
      continue;
    }

    canonicalHints.push(signal.canonicalName);
    signal.evidenceSpanIds.forEach((id) => supportEvidenceSpanIds.add(id));
    supportReasons.add(
      signal.reviewStrength === "VERIFIED"
        ? "KB_ALIAS_EQUIVALENCE"
        : "KB_ALIAS_PENDING_HINT"
    );
  }

  if (uniqueOrdered(canonicalHints).length > 1) {
    blockReasons.add("CONFLICTING_CANONICAL_HINTS");
  }

  return {
    canonicalHints        : uniqueOrdered(canonicalHints),
    supportReasons        : Array.from(supportReasons),
    blockReasons          : Array.from(blockReasons),
    supportEvidenceSpanIds: Array.from(supportEvidenceSpanIds)
  };
}

function hasIsolationBlock(signals: MentionClusterSignals): boolean {
  return (
    signals.blockReasons.includes("NEGATIVE_ALIAS_RULE")
    || signals.blockReasons.includes("IMPERSONATION")
    || signals.blockReasons.includes("MISIDENTIFICATION")
    || signals.blockReasons.includes("CONFLICTING_CANONICAL_HINTS")
  );
}

function getPreliminaryGroupKey(
  mention: StageBMentionRow,
  signals: MentionClusterSignals
): string {
  if (hasIsolationBlock(signals)) {
    return `mention:${mention.id}`;
  }

  if (mention.suspectedResolvesTo) {
    return `suspected:${mention.suspectedResolvesTo}`;
  }

  if (signals.canonicalHints.length === 1) {
    return `canonical:${normalizeSurfaceText(signals.canonicalHints[0])}`;
  }

  if (isExactNamedMergeEligible(mention)) {
    return `canonical:${normalizeSurfaceText(mention.surfaceText)}`;
  }

  return `mention:${mention.id}`;
}

function shouldAddExactNamedSurfaceSupport(mentions: StageBMentionRow[]): boolean {
  if (mentions.length <= 1 || !mentions.every(isExactNamedMergeEligible)) {
    return false;
  }

  return new Set(mentions.map((mention) => normalizeSurfaceText(mention.surfaceText))).size === 1;
}

function isUnsupportedAmbiguousSingleton(
  mentions: StageBMentionRow[],
  canonicalHints: string[],
  supportReasons: Set<StageBSupportReason>
): boolean {
  const suspectedHintCount = new Set(
    mentions
      .map((mention) => mention.suspectedResolvesTo)
      .filter((value): value is string => value !== null)
  ).size;

  return (
    mentions.length === 1
    && !isExactNamedMergeEligible(mentions[0])
    && canonicalHints.length === 0
    && supportReasons.size === 0
    && suspectedHintCount === 0
  );
}

function buildCluster(
  accumulator: CandidateClusterAccumulator
): Omit<StageBCandidateCluster, "candidateRef"> {
  const mentions = sortMentions(accumulator.mentions);
  const supportReasons = new Set(accumulator.supportReasons);
  const blockReasons = new Set(accumulator.blockReasons);
  const suspectedHints = new Set(
    mentions
      .map((mention) => mention.suspectedResolvesTo)
      .filter((value): value is string => value !== null)
  );

  if (suspectedHints.size === 1) {
    supportReasons.add("SUSPECTED_RESOLVES_TO");
  }

  if (suspectedHints.size > 1) {
    blockReasons.add("SUSPECTED_RESOLVES_TO_CONFLICT");
  }

  if (shouldAddExactNamedSurfaceSupport(mentions)) {
    supportReasons.add("EXACT_NAMED_SURFACE");
    mentions.forEach((mention) => accumulator.supportEvidenceSpanIds.add(mention.evidenceSpanId));
  }

  const canonicalHints = uniqueOrdered(accumulator.canonicalHints);

  if (isUnsupportedAmbiguousSingleton(mentions, canonicalHints, supportReasons)) {
    blockReasons.add("TITLE_ONLY_AMBIGUITY");
  }

  return {
    mentions,
    canonicalHints,
    supportReasons        : Array.from(supportReasons).sort(),
    blockReasons          : Array.from(blockReasons).sort(),
    supportEvidenceSpanIds: Array.from(accumulator.supportEvidenceSpanIds),
    mergeConfidence       : averageConfidence(mentions)
  };
}

function clusterSortKey(cluster: Omit<StageBCandidateCluster, "candidateRef">): {
  chapterNo: number;
  mentionId: string;
} {
  return {
    chapterNo: cluster.mentions[0]?.chapterNo ?? Number.MAX_SAFE_INTEGER,
    mentionId: cluster.mentions[0]?.id ?? ""
  };
}

export function buildStageBCandidateClusters(input: {
  mentions   : StageBMentionRow[];
  aliasClaims: StageBAliasClaimRow[];
}): StageBCandidateCluster[] {
  const indexes = buildAliasSignalIndexes(input.aliasClaims);
  const groups = new Map<string, CandidateClusterAccumulator>();

  for (const mention of input.mentions) {
    const signals = collectMentionSignals(mention, indexes);
    const groupKey = getPreliminaryGroupKey(mention, signals);
    const group = groups.get(groupKey) ?? {
      mentions              : [],
      canonicalHints        : [],
      supportReasons        : new Set<StageBSupportReason>(),
      blockReasons          : new Set<StageBBlockReason>(),
      supportEvidenceSpanIds: new Set<string>()
    };

    group.mentions.push(mention);
    group.canonicalHints.push(...signals.canonicalHints);
    signals.supportReasons.forEach((reason) => group.supportReasons.add(reason));
    signals.blockReasons.forEach((reason) => group.blockReasons.add(reason));
    signals.supportEvidenceSpanIds.forEach((id) => group.supportEvidenceSpanIds.add(id));
    groups.set(groupKey, group);
  }

  return Array.from(groups.values())
    .map(buildCluster)
    .sort((left, right) => {
      const leftKey = clusterSortKey(left);
      const rightKey = clusterSortKey(right);

      return leftKey.chapterNo - rightKey.chapterNo || leftKey.mentionId.localeCompare(rightKey.mentionId);
    })
    .map((cluster, index) => ({
      ...cluster,
      candidateRef: `candidate-${index + 1}`
    }));
}
