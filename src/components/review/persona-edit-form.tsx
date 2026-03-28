"use client";

import { useState } from "react";
import { Check, X as XIcon, Loader2 } from "lucide-react";

import { readClientApiErrorMessage } from "@/lib/client-api";
import { patchPersona } from "@/lib/services/personas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PersonaEditFormProps {
  personaId  : string;
  initialData: {
    name      : string;
    aliases   : string[];
    hometown  : string | null;
    confidence: number;
  };
  onSaved : () => void;
  onCancel: () => void;
}

export function PersonaEditForm({
  personaId,
  initialData,
  onSaved,
  onCancel
}: PersonaEditFormProps) {
  const [name, setName] = useState(initialData.name);
  const [aliases, setAliases] = useState(initialData.aliases.join("、"));
  const [hometown, setHometown] = useState(initialData.hometown ?? "");
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
      if (name !== initialData.name) body.name = name;
      const newAliases = aliases
        .split(/[、,，]/)
        .map(s => s.trim())
        .filter(Boolean);
      if (JSON.stringify(newAliases) !== JSON.stringify(initialData.aliases)) {
        body.aliases = newAliases;
      }
      const newHometown = hometown.trim() || null;
      if (newHometown !== initialData.hometown) body.hometown = newHometown;
      const newConfidence = Number(confidence) / 100;
      if (Math.abs(newConfidence - initialData.confidence) > 0.001) {
        body.confidence = newConfidence;
      }

      if (Object.keys(body).length === 0) {
        onCancel();
        return;
      }

      await patchPersona(personaId, body);
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
          <span className="text-xs text-muted-foreground">姓名</span>
          <Input value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">别名（顿号分隔）</span>
          <Input value={aliases} onChange={e => setAliases(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">籍贯</span>
          <Input
            value={hometown}
            onChange={e => setHometown(e.target.value)}
            placeholder="可选"
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
