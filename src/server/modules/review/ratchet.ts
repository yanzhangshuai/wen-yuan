/**
 * 棘轮校准（Pass4 例外审核流）。
 *
 * 依据架构 doc §7.3：每批自动接受后抽样人工回查，度量自动接受准确率
 * → 达标放宽（提高置信下限 / 减少抽样）、不达标收紧（更多类型进人审）。
 * 人工量随系统被验证可靠而递减（back pressure）。
 */
import { RATCHET_ACCURACY_TARGET, RATCHET_SAMPLE_RATE } from "./config";

/** 棘轮校准结果（驱动自动接受阈值调整）。 */
export interface RatchetResult {
  /** 抽样回查的自动接受样本数。 */
  sampled   : number;
  /** 人工判定为"接受正确"的样本数。 */
  correct   : number;
  /** 自动接受准确率 = correct / sampled（0-1）。 */
  accuracy  : number;
  /** 建议动作：达标放宽 / 未达标收紧。 */
  action    : "RELAX" | "TIGHTEN";
  /** 调整建议（相对当前阈值）。 */
  suggestion: string;
}

export interface RatchetSample {
  /** 自动接受时是否被判正确。 */
  correct: boolean;
}

/**
 * 功能：对一批自动接受样本做棘轮校准。
 * 输入：抽样回查结果（每样本是否人工判定正确）。
 * 输出：准确率 + 达标放宽/未达标收紧建议。
 * 异常：无。
 * 副作用：无（纯函数）。
 */
export function calibrateAutoAccept(samples: RatchetSample[]): RatchetResult {
  const sampled = samples.length;
  const correct = samples.filter((s) => s.correct).length;
  const accuracy = sampled > 0 ? correct / sampled : 0;

  const metTarget = accuracy >= RATCHET_ACCURACY_TARGET;
  return {
    sampled,
    correct,
    accuracy,
    action    : metTarget ? "RELAX" : "TIGHTEN",
    suggestion: metTarget
      ? `自动接受准确率 ${accuracy.toFixed(2)} ≥ 目标 ${RATCHET_ACCURACY_TARGET}，可放宽（提高置信下限/减少抽样）`
      : `自动接受准确率 ${accuracy.toFixed(2)} < 目标 ${RATCHET_ACCURACY_TARGET}，需收紧（更多类型进人审）`
  };
}

/** 抽样比例（RATCHET_SAMPLE_RATE）：从一批自动接受样本中抽多少回查。 */
export function sampleRatchetSize(totalAccepted: number): number {
  return Math.max(1, Math.round(totalAccepted * RATCHET_SAMPLE_RATE));
}
