"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { fetchModels, type AdminModelItem } from "@/lib/services/models";
import {
  createRelationshipType,
  pollRelationshipTypeGenerationJob,
  previewRelationshipTypeGenerationPrompt,
  RELATIONSHIP_TYPE_GROUPS,
  reviewGeneratedRelationshipTypes,
  type GeneratedRelationshipTypeCandidate,
  type RelationshipDirectionMode
} from "@/lib/services/relationship-types";

const ALL_VALUE = "__ALL__";

const directionLabels: Record<RelationshipDirectionMode, string> = {
  SYMMETRIC: "对称",
  INVERSE  : "互逆",
  DIRECTED : "单向"
};

function previewLabels(candidate: GeneratedRelationshipTypeCandidate) {
  const edgeLabel = candidate.edgeLabel?.trim() || candidate.name.trim() || "关系";
  if (candidate.directionMode === "SYMMETRIC") {
    return { aToB: edgeLabel, bToA: edgeLabel, edge: edgeLabel };
  }
  return {
    aToB: candidate.targetRoleLabel?.trim() || edgeLabel,
    bToA: candidate.sourceRoleLabel?.trim() || candidate.reverseEdgeLabel?.trim() || edgeLabel,
    edge: edgeLabel
  };
}

export function RelationshipTypeGeneratorPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [models, setModels]                                         = useState<AdminModelItem[]>([]);
  const [targetCount, setTargetCount]                               = useState(30);
  const [targetGroup, setTargetGroup]                               = useState(ALL_VALUE);
  const [modelId, setModelId]                                       = useState(ALL_VALUE);
  const [additionalInstructions, setAdditionalInstructions]         = useState("");
  const [promptPreview, setPromptPreview]                           = useState<string | null>(null);
  const [candidates, setCandidates]                                 = useState<GeneratedRelationshipTypeCandidate[]>([]);
  const [skippedExistingCandidates, setSkippedExistingCandidates]   = useState(0);
  const [selectedCandidateKeys, setSelectedCandidateKeys]           = useState<Set<string>>(new Set());
  const [generating, setGenerating]                                 = useState(false);
  const [saving, setSaving]                                         = useState(false);

  useEffect(() => {
    void fetchModels().then((data) => setModels(data.filter((item) => item.isEnabled))).catch(() => setModels([]));
  }, []);

  const activeModels = useMemo(() => models.filter((item) => item.isEnabled), [models]);

  async function handlePreviewPrompt() {
    try {
      const preview = await previewRelationshipTypeGenerationPrompt({
        targetCount,
        targetGroup           : targetGroup === ALL_VALUE ? undefined : targetGroup,
        additionalInstructions: additionalInstructions.trim() || undefined
      });
      setPromptPreview([preview.systemPrompt, preview.userPrompt].join("\n\n---\n\n"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提示词预览失败");
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setPromptPreview(null);
    setCandidates([]);
    setSkippedExistingCandidates(0);
    setSelectedCandidateKeys(new Set());
    try {
      const { jobId } = await reviewGeneratedRelationshipTypes({
        targetCount,
        targetGroup           : targetGroup === ALL_VALUE ? undefined : targetGroup,
        additionalInstructions: additionalInstructions.trim() || undefined,
        modelId               : modelId === ALL_VALUE ? undefined : modelId
      });

      for (let attempt = 0; attempt < 120; attempt += 1) {
        const job = await pollRelationshipTypeGenerationJob(jobId);
        if (job.status === "done" && job.result) {
          setCandidates(job.result.candidates);
          setSkippedExistingCandidates(job.result.skippedExisting);
          setSelectedCandidateKeys(new Set(job.result.candidates.filter((c) => c.defaultSelected).map((c) => c.name)));
          toast.success(`候选关系类型生成完成，已过滤已有 ${job.result.skippedExisting} 条`);
          return;
        }
        if (job.status === "error") {
          throw new Error(job.error ?? "生成失败");
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      throw new Error("生成任务超时");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveCandidates() {
    const selectedCandidates = candidates.filter((c) => selectedCandidateKeys.has(c.name));
    if (selectedCandidates.length === 0) {
      toast.error("请先选择要保存的候选");
      return;
    }
    setSaving(true);
    try {
      for (const candidate of selectedCandidates) {
        await createRelationshipType({ ...candidate, status: "PENDING_REVIEW" });
      }
      toast.success(`已保存 ${selectedCandidates.length} 条候选为待审核`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "候选保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="grid gap-4">
          <div className="grid gap-3 lg:grid-cols-[160px_180px_minmax(180px,1fr)_auto]">
            <Field label="目标条数" id="target-count">
              <Input id="target-count" type="number" min={1} max={100} value={targetCount} onChange={(event) => setTargetCount(Number(event.target.value))} />
            </Field>
            <FilterSelect label="目标分组" value={targetGroup} values={[ALL_VALUE, ...RELATIONSHIP_TYPE_GROUPS]} getLabel={(value) => value === ALL_VALUE ? "不限分组" : value} onValueChange={setTargetGroup} />
            <FilterSelect label="生成模型" value={modelId} values={[ALL_VALUE, ...activeModels.map((item) => item.id)]} getLabel={(value) => value === ALL_VALUE ? "使用默认模型" : activeModels.find((item) => item.id === value)?.name ?? value} onValueChange={setModelId} />
            <div className="flex items-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>返回</Button>
              <Button type="button" variant="outline" onClick={() => void handlePreviewPrompt()}>预览提示词</Button>
              <Button type="button" onClick={() => void handleGenerate()} disabled={generating}>{generating ? "生成中..." : "开始预审"}</Button>
            </div>
          </div>
          <Field label="补充要求" id="additional-instructions">
            <Textarea id="additional-instructions" value={additionalInstructions} onChange={(event) => setAdditionalInstructions(event.target.value)} placeholder="例如：优先补充明清小说常见亲属和官场关系" />
          </Field>
          {promptPreview ? <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{promptPreview}</pre> : null}
          {candidates.length > 0 ? (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-medium">候选结果</h2>
                  {skippedExistingCandidates > 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">已过滤当前知识库已有关系类型 {skippedExistingCandidates} 条。</p>
                  ) : null}
                </div>
                <Button type="button" size="sm" onClick={() => void handleSaveCandidates()} disabled={saving}>
                  <Check className="h-4 w-4" />
                  保存选中为待审核
                </Button>
              </div>
              <div className="grid gap-2">
                {candidates.map((candidate) => {
                  const preview = previewLabels(candidate);
                  const selectedCandidate = selectedCandidateKeys.has(candidate.name);
                  return (
                    <div key={candidate.name} className="flex gap-3 rounded-md border p-3 text-sm">
                      <Checkbox
                        checked={selectedCandidate}
                        aria-label={`选择候选关系类型 ${candidate.name}`}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedCandidateKeys);
                          if (checked) next.add(candidate.name);
                          else next.delete(candidate.name);
                          setSelectedCandidateKeys(next);
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{candidate.name}</span>
                          <Badge variant="outline">{candidate.group}</Badge>
                          <Badge variant="secondary">{directionLabels[candidate.directionMode]}</Badge>
                          {candidate.rejectionReason ? <span className="text-destructive">{candidate.rejectionReason}</span> : null}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          A 对 B：{preview.aToB}；B 对 A：{preview.bToA}；图谱边：{preview.edge}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : skippedExistingCandidates > 0 ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              模型返回的候选已全部被过滤，其中已有关系类型 {skippedExistingCandidates} 条。可调整目标分组或补充要求后重新生成。
            </div>
          ) : null}
        </div>
    </div>
  );
}

interface FieldProps {
  label   : string;
  id      : string;
  children: ReactNode;
}

function Field({ label, id, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

interface FilterSelectProps {
  label        : string;
  value        : string;
  values       : string[];
  getLabel     : (value: string) => string;
  onValueChange: (value: string) => void;
}

function FilterSelect({ label, value, values, getLabel, onValueChange }: FilterSelectProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>{getLabel(item)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
