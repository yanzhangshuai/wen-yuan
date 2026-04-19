export const CLAIM_REVIEW_STATE_VALUES = Object.freeze([
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EDITED",
  "DEFERRED",
  "CONFLICTED"
] as const);

export type ClaimReviewState = (typeof CLAIM_REVIEW_STATE_VALUES)[number];

export const CLAIM_SOURCE_VALUES = Object.freeze([
  "AI",
  "RULE",
  "MANUAL",
  "IMPORTED"
] as const);

export type ClaimSource = (typeof CLAIM_SOURCE_VALUES)[number];

export const RELATION_DIRECTION_VALUES = Object.freeze([
  "FORWARD",
  "REVERSE",
  "BIDIRECTIONAL",
  "UNDIRECTED"
] as const);

export type RelationDirection = (typeof RELATION_DIRECTION_VALUES)[number];

export const RELATION_TYPE_SOURCE_VALUES = Object.freeze([
  "PRESET",
  "CUSTOM",
  "NORMALIZED_FROM_CUSTOM"
] as const);

export type RelationTypeSource = (typeof RELATION_TYPE_SOURCE_VALUES)[number];

// 审核状态机白名单：集中定义可达状态，避免各调用方散落硬编码。
const REVIEW_STATE_TRANSITIONS: Readonly<Record<ClaimReviewState, readonly ClaimReviewState[]>> =
  Object.freeze({
    PENDING   : Object.freeze(["ACCEPTED", "REJECTED", "EDITED", "DEFERRED", "CONFLICTED"] as const),
    ACCEPTED  : Object.freeze(["EDITED", "DEFERRED"] as const),
    REJECTED  : Object.freeze([] as const),
    EDITED    : Object.freeze(["ACCEPTED", "DEFERRED"] as const),
    DEFERRED  : Object.freeze(["PENDING", "ACCEPTED", "REJECTED", "EDITED", "CONFLICTED"] as const),
    CONFLICTED: Object.freeze(["ACCEPTED", "REJECTED", "EDITED", "DEFERRED"] as const)
  });

/**
 * 返回当前状态允许流转到的下一状态集合，供 service/action 做统一判定。
 */
export function getNextReviewStates(state: ClaimReviewState): readonly ClaimReviewState[] {
  return REVIEW_STATE_TRANSITIONS[state];
}

/**
 * 判断状态流转是否合法，不抛错，适合分支判断场景。
 */
export function canTransitionReviewState(from: ClaimReviewState, to: ClaimReviewState): boolean {
  return REVIEW_STATE_TRANSITIONS[from].includes(to);
}

/**
 * 在必须保障状态机完整性的写路径中使用，非法流转直接抛出可定位错误。
 */
export function assertReviewStateTransition(from: ClaimReviewState, to: ClaimReviewState): void {
  if (!canTransitionReviewState(from, to)) {
    throw new Error(`Claim review state cannot transition from ${from} to ${to}`);
  }
}

/**
 * 仅 ACCEPTED 可进入 projection，避免把未审核确认的数据投影到下游读模型。
 */
export function isProjectionEligibleReviewState(state: ClaimReviewState): boolean {
  return state === "ACCEPTED";
}
