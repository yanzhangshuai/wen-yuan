import { buildEvidenceReviewDirtySet } from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/dirty-set";
import { buildEvidenceReviewRerunExplanation } from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain";
import {
  createEvidenceReviewRerunRepository,
  evidenceReviewRerunRepository,
  type EvidenceReviewRerunRepository
} from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/repository";
import { getEvidenceReviewStagePolicy } from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/stage-policy";
import {
  EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES,
  type EvidenceReviewRerunChange,
  type EvidenceReviewRerunPlan,
  type EvidenceReviewRerunStageKey,
  type EvidenceReviewRerunScopeKind,
  type EvidenceReviewStagePlan
} from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/types";

export interface EvidenceReviewRerunPlannerDependencies {
  repository?: EvidenceReviewRerunRepository;
}

function toScopeKind(
  change: EvidenceReviewRerunChange,
  stageKey: EvidenceReviewRerunStageKey
): EvidenceReviewRerunScopeKind {
  if (stageKey === "STAGE_D") {
    return "PROJECTION_REBUILD";
  }

  if (
    change.changeKind === "CHAPTER_TEXT_CHANGE"
    && (stageKey === "STAGE_0" || stageKey === "STAGE_A" || stageKey === "STAGE_A_PLUS")
  ) {
    return "LOCAL_CHAPTER";
  }

  return "FULL_BOOK";
}

function toStagePlan(
  change: EvidenceReviewRerunChange,
  stageKey: EvidenceReviewRerunStageKey,
  chapterIds: string[]
): EvidenceReviewStagePlan {
  const scopeKind = toScopeKind(change, stageKey);

  return {
    stageKey,
    scopeKind,
    chapterIds             : scopeKind === "LOCAL_CHAPTER" ? chapterIds : [],
    preservePreviousOutputs: scopeKind !== "LOCAL_CHAPTER"
  };
}

async function resolveComparableBaselineRunId(
  repository: EvidenceReviewRerunRepository,
  change: EvidenceReviewRerunChange,
  runIds: readonly string[]
): Promise<string | null> {
  const explicitRunId = runIds[0] ?? null;
  if (explicitRunId !== null) {
    return explicitRunId;
  }

  return (await repository.findLatestSuccessfulRun(change.bookId))?.runId ?? null;
}

export function createEvidenceReviewRerunPlanner(
  dependencies: EvidenceReviewRerunPlannerDependencies = {}
) {
  const repository = dependencies.repository ?? evidenceReviewRerunRepository ?? createEvidenceReviewRerunRepository();

  async function planChange(change: EvidenceReviewRerunChange): Promise<EvidenceReviewRerunPlan> {
    const dirtySet = buildEvidenceReviewDirtySet(change);
    const policy = getEvidenceReviewStagePolicy(change);
    const chapterMetadata = dirtySet.chapterIds.length > 0
      ? await repository.listChapterMetadata(dirtySet.chapterIds)
      : [];
    const chapterNos = chapterMetadata
      .map((chapter) => chapter.chapterNo)
      .sort((left, right) => left - right);
    const comparableBaselineRunId = await resolveComparableBaselineRunId(
      repository,
      change,
      dirtySet.runIds
    );
    const stagePlans = policy.expectedStages.map((stageKey) =>
      toStagePlan(change, stageKey, dirtySet.chapterIds)
    );

    const plan: EvidenceReviewRerunPlan = {
      bookId        : change.bookId,
      changeKind    : change.changeKind,
      executionMode : policy.executionMode,
      reason        : change.reason,
      expectedStages: policy.expectedStages,
      affectedRange : {
        runIds             : dirtySet.runIds,
        chapterIds         : dirtySet.chapterIds,
        chapterNos,
        segmentIds         : dirtySet.segmentIds,
        claimFamilies      : dirtySet.claimFamilies,
        personaCandidateIds: dirtySet.personaCandidateIds,
        projectionScopes   : dirtySet.projectionSlices,
        projectionFamilies : dirtySet.projectionFamilies
      },
      stagePlans,
      cache: {
        invalidateStageKeys: [...policy.expectedStages],
        preserveStageKeys  : EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES.filter(
          (stageKey) => !policy.expectedStages.includes(stageKey)
        ),
        invalidatedProjectionFamilies: [...policy.projectionFamilies],
        comparableBaselineRunId
      },
      explanation: {
        summary: "",
        lines  : []
      }
    };

    plan.explanation = buildEvidenceReviewRerunExplanation({
      change,
      executionMode: plan.executionMode,
      affectedRange: {
        chapterNos        : plan.affectedRange.chapterNos,
        projectionFamilies: plan.affectedRange.projectionFamilies
      },
      stagePlans: plan.stagePlans
    });

    return plan;
  }

  return {
    planChange
  };
}

export type EvidenceReviewRerunPlanner = ReturnType<typeof createEvidenceReviewRerunPlanner>;
export const evidenceReviewRerunPlanner = createEvidenceReviewRerunPlanner();
