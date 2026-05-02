"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createRelationshipEvent,
  patchRelationshipEvent,
  type RelationshipEventRecordSource,
  type RelationshipEventStatus
} from "@/lib/services/relationship-events";

const QUICK_TAG_GROUPS = [
  { label: "情感", tags: ["感激", "怨恨", "倾慕", "厌恶", "愧疚", "惧怕"] },
  { label: "行为", tags: ["资助", "提携", "排挤", "背叛", "庇护"] },
  { label: "演化", tags: ["疏远", "决裂", "修好", "公开", "隐瞒", "利用"] }
] as const;

export interface RelationshipEventFormChapter {
  id   : string;
  no   : number;
  title: string | null;
}

export interface RelationshipEventFormEvent {
  id          : string;
  chapterId   : string;
  summary     : string;
  evidence    : string | null;
  attitudeTags: string[];
  paraIndex   : number | null;
  confidence  : number;
  recordSource: RelationshipEventRecordSource;
  status      : RelationshipEventStatus;
}

export interface RelationshipEventFormProps {
  relationshipId: string;
  chapters      : RelationshipEventFormChapter[];
  event?        : RelationshipEventFormEvent;
  onSaved       : () => void;
  onCancel      : () => void;
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

export function RelationshipEventForm({
  relationshipId,
  chapters,
  event,
  onSaved,
  onCancel
}: RelationshipEventFormProps) {
  const defaultChapterId = event?.chapterId ?? chapters[0]?.id ?? "";
  const [chapterId, setChapterId] = useState(defaultChapterId);
  const [summary, setSummary] = useState(event?.summary ?? "");
  const [evidence, setEvidence] = useState(event?.evidence ?? "");
  const [paraIndex, setParaIndex] = useState(event?.paraIndex === null || event?.paraIndex === undefined ? "" : String(event.paraIndex));
  const [confidence, setConfidence] = useState(String(event?.confidence ?? 0.8));
  const [tags, setTags] = useState<string[]>(event?.attitudeTags ?? []);
  const [customTag, setCustomTag] = useState("");
  const [recordSource, setRecordSource] = useState<RelationshipEventRecordSource>(event?.recordSource ?? "MANUAL");
  const [status, setStatus] = useState<RelationshipEventStatus>(event?.status ?? "VERIFIED");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedTags = useMemo(() => normalizeTags(tags), [tags]);

  function addTag(tag: string) {
    setTags(current => normalizeTags([...current, tag]));
  }

  function removeTag(tag: string) {
    const key = tag.toLowerCase();
    setTags(current => current.filter(item => item.trim().toLowerCase() !== key));
  }

  function addCustomTag() {
    addTag(customTag);
    setCustomTag("");
  }

  async function handleSave() {
    const trimmedSummary = summary.trim();
    if (!chapterId || !trimmedSummary) {
      setError("章节和事件摘要不能为空");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        chapterId,
        summary     : trimmedSummary,
        evidence    : evidence.trim() || null,
        attitudeTags: normalizedTags,
        paraIndex   : paraIndex.trim() ? Number(paraIndex) : null,
        confidence  : Number(confidence),
        recordSource,
        status
      };

      if (event) {
        await patchRelationshipEvent(event.id, body);
      } else {
        const { recordSource: _recordSource, status: _status, ...createBody } = body;
        void _recordSource;
        void _status;
        await createRelationshipEvent(relationshipId, createBody);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存关系事件失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-md border bg-card p-4" onSubmit={(submitEvent) => { submitEvent.preventDefault(); void handleSave(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">章节</span>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={chapterId}
            onChange={changeEvent => setChapterId(changeEvent.target.value)}
          >
            {chapters.map(chapter => (
              <option key={chapter.id} value={chapter.id}>
                第 {chapter.no} 回{chapter.title ? ` · ${chapter.title}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">段落索引</span>
          <Input
            type="number"
            min={0}
            value={paraIndex}
            onChange={changeEvent => setParaIndex(changeEvent.target.value)}
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted-foreground">事件摘要</span>
        <Textarea value={summary} onChange={changeEvent => setSummary(changeEvent.target.value)} rows={3} />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted-foreground">证据原文</span>
        <Textarea value={evidence} onChange={changeEvent => setEvidence(changeEvent.target.value)} rows={2} />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-xs text-muted-foreground">置信度</span>
        <Input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={confidence}
          onChange={changeEvent => setConfidence(changeEvent.target.value)}
        />
      </label>

      <div className="grid gap-2">
        {QUICK_TAG_GROUPS.map(group => (
          <div key={group.label} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">{group.label}</span>
            {group.tags.map(tag => (
              <Button key={tag} type="button" size="sm" variant="outline" onClick={() => addTag(tag)}>
                {tag}
              </Button>
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {normalizedTags.map(tag => (
          <Badge key={tag} variant="outline" className="gap-1">
            {tag}
            <button type="button" aria-label={`移除${tag}`} onClick={() => removeTag(tag)}>
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="flex gap-2">
        <label className="sr-only" htmlFor="relationship-event-custom-tag">自定义标签</label>
        <Input
          id="relationship-event-custom-tag"
          value={customTag}
          onChange={changeEvent => setCustomTag(changeEvent.target.value)}
        />
        <Button type="button" variant="outline" onClick={addCustomTag}>
          <Plus className="size-4" />
          添加标签
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">数据来源</span>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={recordSource}
            onChange={changeEvent => setRecordSource(changeEvent.target.value as RelationshipEventRecordSource)}
          >
            <option value="DRAFT_AI">DRAFT_AI</option>
            <option value="AI">AI</option>
            <option value="MANUAL">MANUAL</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">状态</span>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={changeEvent => setStatus(changeEvent.target.value as RelationshipEventStatus)}
          >
            <option value="DRAFT">DRAFT</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>取消</Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          保存关系事件
        </Button>
      </div>
    </form>
  );
}
