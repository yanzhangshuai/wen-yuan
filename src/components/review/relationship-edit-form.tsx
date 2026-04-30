"use client";

/**
 * =============================================================================
 * 文件定位（角色资料工作台子组件：关系记录编辑表单）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/review/relationship-edit-form.tsx`
 *
 * 在 Next.js 项目中的角色：
 * - 角色资料工作台里的 Client Component；
 * - 用于人工修正单条关系边（type/weight/evidence/confidence）。
 *
 * 业务职责：
 * 1) 提供关系字段编辑入口；
 * 2) 基于初始值构建最小 Patch 请求；
 * 3) 反馈保存状态并在成功后回调父层刷新。
 *
 * 设计边界：
 * - 本组件只处理交互与差异组装；
 * - 关系合法性（例如 type 枚举约束）最终由服务端负责兜底校验。
 * =============================================================================
 */

import { useState } from "react";
import { Check, X as XIcon, Loader2 } from "lucide-react";

import { readClientApiErrorMessage } from "@/lib/client-api";
import { patchRelationship } from "@/lib/services/relationships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface RelationshipEditFormProps {
  /** 被编辑关系记录 ID。 */
  relationshipId: string;
  /** 编辑初始值，用于“是否变更”的比较基线。 */
  initialData: {
    /** 关系类型（如师生、亲属、同僚等）。 */
    type      : string;
    /** 关系权重，表示关系强度或显著性。 */
    weight    : number;
    /** 证据原文，可空。 */
    evidence  : string | null;
    /** 置信度（0~1）。 */
    confidence: number;
  };
  /** 保存成功回调。 */
  onSaved : () => void;
  /** 取消编辑回调。 */
  onCancel: () => void;
}

export function RelationshipEditForm({
  relationshipId,
  initialData,
  onSaved,
  onCancel
}: RelationshipEditFormProps) {
  /** 关系类型输入值。 */
  const [type, setType] = useState(initialData.type);
  /** 权重输入值（字符串态，便于输入过程容错）。 */
  const [weight, setWeight] = useState(String(initialData.weight));
  /** 证据输入值（null -> "" 以适配文本框）。 */
  const [evidence, setEvidence] = useState(initialData.evidence ?? "");
  /** 置信度输入值（百分比字符串）。 */
  const [confidence, setConfidence] = useState(
    String((initialData.confidence * 100).toFixed(0))
  );
  /** 保存中状态。 */
  const [saving, setSaving] = useState(false);
  /** 错误文案状态。 */
  const [error, setError] = useState<string | null>(null);

  /**
   * 提交关系编辑。
   * 核心策略：仅提交发生变化的字段，减少无效更新风险。
   */
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (type !== initialData.type) body.type = type;

      // 数值输入先转 Number，再与初始值比较；保持接口字段为 number。
      const newWeight = Number(weight);
      if (newWeight !== initialData.weight) body.weight = newWeight;

      // 空字符串统一归一为 null，避免后端出现 "" 与 null 语义分裂。
      const newEvidence = evidence.trim() || null;
      if (newEvidence !== initialData.evidence) body.evidence = newEvidence;

      // 百分比转 0~1，使用微小阈值规避浮点误差。
      const newConfidence = Number(confidence) / 100;
      if (Math.abs(newConfidence - initialData.confidence) > 0.001) {
        body.confidence = newConfidence;
      }

      // 无改动直接退出：这是“避免空 Patch 请求”的防御策略。
      if (Object.keys(body).length === 0) {
        onCancel();
        return;
      }

      await patchRelationship(relationshipId, body);
      onSaved();
    } catch (err) {
      // 兜底：非 Error 情况下回退统一错误文案。
      setError(err instanceof Error ? err.message : readClientApiErrorMessage(null, "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-primary bg-card p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">关系类型</span>
          <Input value={type} onChange={e => setType(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">权重</span>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={weight}
            onChange={e => setWeight(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">置信度 (%)</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={confidence}
            onChange={e => setConfidence(e.target.value)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">证据原文</span>
        <Textarea
          value={evidence}
          onChange={e => setEvidence(e.target.value)}
          rows={2}
          placeholder="可选"
        />
      </label>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <XIcon size={14} />
          <span className="ml-1">取消</span>
        </Button>
        <Button size="sm" onClick={() => { void handleSave(); }} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          <span className="ml-1">保存</span>
        </Button>
      </div>
    </div>
  );
}
