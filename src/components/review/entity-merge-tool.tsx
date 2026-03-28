"use client";

import { use, useState } from "react";
import {
  GitMerge,
  Loader2,
  ArrowRight,
  X as XIcon,
  AlertTriangle,
  User
} from "lucide-react";

import { readClientApiErrorMessage } from "@/lib/client-api";
import { acceptMergeSuggestion } from "@/lib/services/reviews";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import type { PersonaSummary } from "@/lib/services/personas";

/* ------------------------------------------------
   Re-export types from api layer
   ------------------------------------------------ */
export type { PersonaSummary } from "@/lib/services/personas";
export { fetchPersonaSummary } from "@/lib/services/personas";

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface EntityMergeToolProps {
  sourcePromise: Promise<PersonaSummary | null>;
  targetPromise: Promise<PersonaSummary | null>;
  suggestionId : string;
  onDone       : () => void;
  onCancel     : () => void;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function EntityMergeTool({
  sourcePromise,
  targetPromise,
  suggestionId,
  onDone,
  onCancel
}: EntityMergeToolProps) {
  const [source, target] = use(Promise.all([sourcePromise, targetPromise]));
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMerge() {
    setMerging(true);
    setError(null);
    try {
      await acceptMergeSuggestion(suggestionId);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : readClientApiErrorMessage(null, "合并失败"));
    } finally {
      setMerging(false);
    }
  }

  if (!source || !target) {
    return (
      <div className="rounded-lg border border-destructive bg-card p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle size={16} />
          <span className="text-sm">无法加载人物数据，请稍后重试。</span>
        </div>
        <Button size="sm" variant="ghost" className="mt-2" onClick={onCancel}>
          关闭
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border-2 border-primary bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <GitMerge size={16} className="text-primary" />
        <span className="font-medium text-foreground">人物合并预览</span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label="关闭"
        >
          <XIcon size={16} />
        </button>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PersonaCard persona={source} label="来源（将被合并）" variant="source" />
        <PersonaCard persona={target} label="目标（保留）" variant="target" />
      </div>

      {/* Merge result preview */}
      <div className="mt-3 rounded-md bg-muted p-3">
        <p className="mb-1 text-xs font-medium text-foreground">合并结果预览</p>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          <li>
            保留名称：<span className="font-medium text-foreground">{target.name}</span>
          </li>
          <li>
            合并别名：{[...new Set([...target.aliases, source.name, ...source.aliases])].join("、") || "无"}
          </li>
          <li>
            关系合计：{source.relationshipCount + target.relationshipCount} 条
          </li>
          <li>
            时间线合计：{source.timelineCount + target.timelineCount} 条
          </li>
        </ul>
      </div>

      {error && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={merging}>
          取消
        </Button>
        <Button size="sm" onClick={() => { void handleMerge(); }} disabled={merging}>
          {merging ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <GitMerge size={14} />
          )}
          <span className="ml-1">确认合并</span>
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------
   Persona card sub-component
   ------------------------------------------------ */
function PersonaCard({
  persona,
  label,
  variant
}: {
  persona: PersonaSummary;
  label  : string;
  variant: "source" | "target";
}) {
  const borderColor =
    variant === "source"
      ? "border-destructive/30"
      : "border-success/30";

  return (
    <div className={`rounded-md border ${borderColor} p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <User size={14} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{persona.name}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        {variant === "source" && (
          <ArrowRight size={14} className="ml-auto text-muted-foreground" />
        )}
      </div>

      <div className="space-y-1 text-xs">
        {persona.aliases.length > 0 && (
          <p className="text-muted-foreground">
            别名：{persona.aliases.join("、")}
          </p>
        )}
        {persona.gender && (
          <p className="text-muted-foreground">性别：{persona.gender}</p>
        )}
        {persona.hometown && (
          <p className="text-muted-foreground">籍贯：{persona.hometown}</p>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          {persona.globalTags.map(tag => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
        <p className="text-muted-foreground">
          关系 {persona.relationshipCount} 条 · 时间线 {persona.timelineCount} 条
        </p>
      </div>
    </div>
  );
}
