"use client";

import { useState } from "react";
import { Check, X as XIcon, Loader2 } from "lucide-react";

import { readClientApiErrorMessage } from "@/lib/client-api";
import { patchRelationship } from "@/lib/services/relationships";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface RelationshipEditFormProps {
  relationshipId: string;
  initialData: {
    type      : string;
    weight    : number;
    evidence  : string | null;
    confidence: number;
  };
  onSaved : () => void;
  onCancel: () => void;
}

export function RelationshipEditForm({
  relationshipId,
  initialData,
  onSaved,
  onCancel
}: RelationshipEditFormProps) {
  const [type, setType] = useState(initialData.type);
  const [weight, setWeight] = useState(String(initialData.weight));
  const [evidence, setEvidence] = useState(initialData.evidence ?? "");
  const [confidence, setConfidence] = useState(
    String((initialData.confidence * 100).toFixed(0))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (type !== initialData.type) body.type = type;
      const newWeight = Number(weight);
      if (newWeight !== initialData.weight) body.weight = newWeight;
      const newEvidence = evidence.trim() || null;
      if (newEvidence !== initialData.evidence) body.evidence = newEvidence;
      const newConfidence = Number(confidence) / 100;
      if (Math.abs(newConfidence - initialData.confidence) > 0.001) {
        body.confidence = newConfidence;
      }

      if (Object.keys(body).length === 0) {
        onCancel();
        return;
      }

      await patchRelationship(relationshipId, body);
      onSaved();
    } catch (err) {
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
