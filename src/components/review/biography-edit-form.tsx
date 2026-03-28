"use client";

import { useState } from "react";
import { Check, X as XIcon, Loader2 } from "lucide-react";

import { readClientApiErrorMessage } from "@/lib/client-api";
import { patchBiography } from "@/lib/services/biography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_OPTIONS = [
  { value: "BIRTH", label: "出生" },
  { value: "EXAM", label: "科举" },
  { value: "CAREER", label: "仕途" },
  { value: "TRAVEL", label: "行旅" },
  { value: "SOCIAL", label: "社交" },
  { value: "DEATH", label: "逝世" },
  { value: "EVENT", label: "事件" }
];

interface BiographyEditFormProps {
  biographyId: string;
  initialData: {
    category: string;
    title   : string | null;
    location: string | null;
    event   : string;
  };
  onSaved : () => void;
  onCancel: () => void;
}

export function BiographyEditForm({
  biographyId,
  initialData,
  onSaved,
  onCancel
}: BiographyEditFormProps) {
  const [category, setCategory] = useState(initialData.category);
  const [title, setTitle] = useState(initialData.title ?? "");
  const [location, setLocation] = useState(initialData.location ?? "");
  const [event, setEvent] = useState(initialData.event);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (category !== initialData.category) body.category = category;
      const newTitle = title.trim() || null;
      if (newTitle !== initialData.title) body.title = newTitle;
      const newLocation = location.trim() || null;
      if (newLocation !== initialData.location) body.location = newLocation;
      if (event !== initialData.event) body.event = event;

      if (Object.keys(body).length === 0) {
        onCancel();
        return;
      }

      await patchBiography(biographyId, body);
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
          <span className="text-xs text-muted-foreground">类别</span>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          >
            {CATEGORY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">标题</span>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="可选" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">地点</span>
          <Input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="可选"
          />
        </label>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">事件描述</span>
        <Textarea
          value={event}
          onChange={e => setEvent(e.target.value)}
          rows={2}
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
