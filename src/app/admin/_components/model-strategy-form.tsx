"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { BUSINESS_PIPELINE_STAGES, PipelineStage } from "@/types/pipeline";
import type { ModelStrategyInput } from "@/lib/services/model-strategy";
import { cn } from "@/lib/utils";

const INHERIT_MODEL_VALUE = "__INHERIT__";
const INHERIT_PARAM_VALUE = "__INHERIT_PARAM__";
const ENABLE_THINKING_TRUE = "__ENABLE_THINKING_TRUE__";
const ENABLE_THINKING_FALSE = "__ENABLE_THINKING_FALSE__";

const STAGES_FOR_FORM: PipelineStage[] = [
  ...BUSINESS_PIPELINE_STAGES,
  PipelineStage.FALLBACK
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  [PipelineStage.ROSTER_DISCOVERY]     : "名册发现",
  [PipelineStage.CHUNK_EXTRACTION]     : "分片提取",
  [PipelineStage.CHAPTER_VALIDATION]   : "章节验证",
  [PipelineStage.TITLE_RESOLUTION]     : "称号溯源",
  [PipelineStage.GRAY_ZONE_ARBITRATION]: "灰区仲裁",
  [PipelineStage.BOOK_VALIDATION]      : "全书验证",
  [PipelineStage.FALLBACK]             : "降级兜底（全阶段共享）"
};

const RECOMMENDED_MODELS: Record<PipelineStage, { provider: string; modelId: string; label: string } | null> = {
  [PipelineStage.ROSTER_DISCOVERY]     : { provider: "glm", modelId: "glm-4.6", label: "GLM 4.6" },
  [PipelineStage.CHUNK_EXTRACTION]     : { provider: "deepseek", modelId: "deepseek-chat", label: "DeepSeek V3" },
  [PipelineStage.CHAPTER_VALIDATION]   : { provider: "qwen", modelId: "qwen-plus", label: "通义千问 Plus" },
  [PipelineStage.TITLE_RESOLUTION]     : { provider: "qwen", modelId: "qwen-max", label: "通义千问 Max" },
  [PipelineStage.GRAY_ZONE_ARBITRATION]: { provider: "qwen", modelId: "qwen-plus", label: "通义千问 Plus" },
  [PipelineStage.BOOK_VALIDATION]      : { provider: "qwen", modelId: "qwen-max", label: "通义千问 Max" },
  [PipelineStage.FALLBACK]             : { provider: "qwen", modelId: "qwen-plus", label: "通义千问 Plus" }
};

export interface EnabledModelItem {
  id      : string;
  name    : string;
  provider: string;
  modelId : string;
}

interface ModelStrategyFormProps {
  initialStrategy        : ModelStrategyInput | null;
  availableModels        : EnabledModelItem[];
  onSave                 : (strategy: ModelStrategyInput) => Promise<void>;
  showResetToRecommended?: boolean;
  readOnly?              : boolean;
}

function cloneStrategy(strategy: ModelStrategyInput | null): ModelStrategyInput {
  if (!strategy) {
    return {};
  }

  const next: ModelStrategyInput = {};
  for (const stage of STAGES_FOR_FORM) {
    const config = strategy[stage];
    if (config?.modelId) {
      next[stage] = { ...config };
    }
  }
  return next;
}

function normalizeStrategy(strategy: ModelStrategyInput): ModelStrategyInput {
  const next: ModelStrategyInput = {};
  for (const stage of STAGES_FOR_FORM) {
    const config = strategy[stage];
    if (config?.modelId) {
      next[stage] = { ...config };
    }
  }
  return next;
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return undefined;
  }

  return num;
}

export function ModelStrategyForm({
  initialStrategy,
  availableModels,
  onSave,
  showResetToRecommended = false,
  readOnly = false
}: ModelStrategyFormProps) {
  const [draftStrategy, setDraftStrategy] = useState<ModelStrategyInput>(() => cloneStrategy(initialStrategy));
  const [advancedModeEnabled, setAdvancedModeEnabled] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Set<PipelineStage>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftStrategy(cloneStrategy(initialStrategy));
  }, [initialStrategy]);

  const recommendedByStage = useMemo(() => {
    const mapping: Record<PipelineStage, EnabledModelItem | null> = {
      [PipelineStage.ROSTER_DISCOVERY]     : null,
      [PipelineStage.CHUNK_EXTRACTION]     : null,
      [PipelineStage.CHAPTER_VALIDATION]   : null,
      [PipelineStage.TITLE_RESOLUTION]     : null,
      [PipelineStage.GRAY_ZONE_ARBITRATION]: null,
      [PipelineStage.BOOK_VALIDATION]      : null,
      [PipelineStage.FALLBACK]             : null
    };

    for (const stage of STAGES_FOR_FORM) {
      const rec = RECOMMENDED_MODELS[stage];
      if (!rec) {
        mapping[stage] = null;
        continue;
      }

      mapping[stage] = availableModels.find(
        model => model.provider === rec.provider && model.modelId === rec.modelId
      ) ?? null;
    }

    return mapping;
  }, [availableModels]);

  function updateStageConfig(
    stage: PipelineStage,
    updater: (current: ModelStrategyInput[PipelineStage] | undefined) => ModelStrategyInput[PipelineStage] | undefined
  ) {
    setDraftStrategy((current) => {
      const next = { ...current };
      const updated = updater(current[stage]);
      if (!updated?.modelId) {
        delete next[stage];
      } else {
        next[stage] = updated;
      }
      return next;
    });
  }

  function updateNumericParam(
    stage: PipelineStage,
    key: "temperature" | "maxOutputTokens" | "topP" | "maxRetries" | "retryBaseMs",
    value: string
  ) {
    updateStageConfig(stage, (current) => {
      if (!current?.modelId) {
        return current;
      }

      const parsed = parseOptionalNumber(value);
      const next = { ...current };
      if (parsed === undefined) {
        delete next[key];
      } else {
        next[key] = parsed;
      }

      return next;
    });
  }

  function updateEnableThinkingParam(stage: PipelineStage, value: string) {
    updateStageConfig(stage, (current) => {
      if (!current?.modelId) {
        return current;
      }

      const next = { ...current };
      if (value === INHERIT_PARAM_VALUE) {
        delete next.enableThinking;
      } else {
        next.enableThinking = value === ENABLE_THINKING_TRUE;
      }

      return next;
    });
  }

  function updateReasoningEffortParam(stage: PipelineStage, value: string) {
    updateStageConfig(stage, (current) => {
      if (!current?.modelId) {
        return current;
      }

      const next = { ...current };
      if (value === INHERIT_PARAM_VALUE) {
        delete next.reasoningEffort;
      } else {
        next.reasoningEffort = value as "low" | "medium" | "high";
      }

      return next;
    });
  }

  function toggleExpand(stage: PipelineStage) {
    setExpandedStages((current) => {
      const next = new Set(current);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
      }
      return next;
    });
  }

  function handleToggleAdvancedMode() {
    setAdvancedModeEnabled((current) => {
      const next = !current;
      if (!next) {
        setExpandedStages(new Set());
      }
      return next;
    });
  }

  function resetToRecommended() {
    const next: ModelStrategyInput = {};
    for (const stage of STAGES_FOR_FORM) {
      const recommendedModel = recommendedByStage[stage];
      if (!recommendedModel) {
        continue;
      }

      const current = draftStrategy[stage];
      next[stage] = {
        modelId        : recommendedModel.id,
        temperature    : current?.temperature,
        maxOutputTokens: current?.maxOutputTokens,
        topP           : current?.topP,
        enableThinking : current?.enableThinking,
        reasoningEffort: current?.reasoningEffort,
        maxRetries     : current?.maxRetries,
        retryBaseMs    : current?.retryBaseMs
      };
    }
    setDraftStrategy(next);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(normalizeStrategy(draftStrategy));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="model-strategy-form">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>模型策略配置</CardTitle>
          <CardDescription>未选择模型的阶段将使用上级默认配置。</CardDescription>
        </div>
        {showResetToRecommended && !readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetToRecommended}
            disabled={availableModels.length === 0 || isSaving}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            恢复推荐配置
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">高级参数</p>
              <p className="text-xs text-muted-foreground">
                默认隐藏，避免普通用户误操作。开启后可调整温度、重试和 thinking 参数；`reasoningEffort` 在不同模型平台的支持可能不同。
              </p>
            </div>
            <Button
              type="button"
              variant={advancedModeEnabled ? "secondary" : "outline"}
              size="sm"
              onClick={handleToggleAdvancedMode}
            >
              {advancedModeEnabled ? "已开启高级模式" : "开启高级模式"}
            </Button>
          </div>
        </div>

        {availableModels.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-2">
            <p>暂无可用模型，请先在模型管理中启用至少一个模型。</p>
            <Link href="/admin/model" className="text-primary hover:underline">
              前往模型管理
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {STAGES_FOR_FORM.map((stage) => {
              const stageConfig = draftStrategy[stage];
              const recommended = recommendedByStage[stage];
              const recommendedMeta = RECOMMENDED_MODELS[stage];
              const selectedIsRecommended = recommended?.id === stageConfig?.modelId;
              const isFallback = stage === PipelineStage.FALLBACK;
              const isExpanded = expandedStages.has(stage);

              return (
                <div
                  key={stage}
                  className={cn(
                    "rounded-lg border border-border p-4 space-y-3",
                    isFallback && "border-primary/30 bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium">{STAGE_LABELS[stage]}</h4>
                      {isFallback && <Badge variant="secondary">FALLBACK</Badge>}
                    </div>
                    {selectedIsRecommended && (
                      <Badge variant="success" className="text-xs">推荐</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 items-end">
                    <div className="space-y-2">
                      <Label htmlFor={`stage-${stage}`}>阶段模型</Label>
                      <Select
                        value={stageConfig?.modelId ?? INHERIT_MODEL_VALUE}
                        onValueChange={(value) => {
                          if (value === INHERIT_MODEL_VALUE) {
                            updateStageConfig(stage, () => undefined);
                            return;
                          }

                          updateStageConfig(stage, (current) => ({
                            ...current,
                            modelId: value
                          }));
                        }}
                        disabled={readOnly}
                      >
                        <SelectTrigger id={`stage-${stage}`}>
                          <SelectValue placeholder="使用上级默认" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={INHERIT_MODEL_VALUE}>使用上级默认</SelectItem>
                          {availableModels.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name} ({model.provider} / {model.modelId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="text-xs">
                      {recommended ? (
                        <span className="text-muted-foreground">
                          推荐：{recommendedMeta?.label ?? recommended.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          推荐模型未启用
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {stageConfig?.modelId ? "已配置当前阶段模型" : "将使用上级默认策略"}
                    </p>
                    {advancedModeEnabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => toggleExpand(stage)}
                        disabled={readOnly}
                      >
                        {isExpanded ? "收起高级参数" : "展开高级参数"}
                      </Button>
                    )}
                  </div>

                  {advancedModeEnabled && isExpanded && (
                    <div className="grid grid-cols-2 lg:grid-cols-7 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">temperature</Label>
                        <Input
                          type="number"
                          step="0.05"
                          min={0}
                          max={2}
                          placeholder="默认 0.2"
                          value={stageConfig?.temperature ?? ""}
                          onChange={(event) => {
                            updateNumericParam(stage, "temperature", event.target.value);
                          }}
                          disabled={readOnly || !stageConfig?.modelId}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">maxOutputTokens</Label>
                        <Input
                          type="number"
                          step={1024}
                          min={256}
                          max={65536}
                          placeholder="默认 8192"
                          value={stageConfig?.maxOutputTokens ?? ""}
                          onChange={(event) => {
                            updateNumericParam(stage, "maxOutputTokens", event.target.value);
                          }}
                          disabled={readOnly || !stageConfig?.modelId}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">topP</Label>
                        <Input
                          type="number"
                          step="0.05"
                          min={0}
                          max={1}
                          placeholder="默认 1.0"
                          value={stageConfig?.topP ?? ""}
                          onChange={(event) => {
                            updateNumericParam(stage, "topP", event.target.value);
                          }}
                          disabled={readOnly || !stageConfig?.modelId}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">maxRetries</Label>
                        <Input
                          type="number"
                          step={1}
                          min={0}
                          max={5}
                          placeholder="默认 1"
                          value={stageConfig?.maxRetries ?? ""}
                          onChange={(event) => {
                            updateNumericParam(stage, "maxRetries", event.target.value);
                          }}
                          disabled={readOnly || !stageConfig?.modelId}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">retryBaseMs</Label>
                        <Input
                          type="number"
                          step={100}
                          min={100}
                          max={10000}
                          placeholder="默认 600"
                          value={stageConfig?.retryBaseMs ?? ""}
                          onChange={(event) => {
                            updateNumericParam(stage, "retryBaseMs", event.target.value);
                          }}
                          disabled={readOnly || !stageConfig?.modelId}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">enableThinking</Label>
                        <Select
                          value={typeof stageConfig?.enableThinking === "boolean"
                            ? (stageConfig.enableThinking ? ENABLE_THINKING_TRUE : ENABLE_THINKING_FALSE)
                            : INHERIT_PARAM_VALUE}
                          onValueChange={(value) => {
                            updateEnableThinkingParam(stage, value);
                          }}
                          disabled={readOnly || !stageConfig?.modelId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="继承默认" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={INHERIT_PARAM_VALUE}>继承阶段默认</SelectItem>
                            <SelectItem value={ENABLE_THINKING_TRUE}>开启</SelectItem>
                            <SelectItem value={ENABLE_THINKING_FALSE}>关闭</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">reasoningEffort</Label>
                        <Select
                          value={stageConfig?.reasoningEffort ?? INHERIT_PARAM_VALUE}
                          onValueChange={(value) => {
                            updateReasoningEffortParam(stage, value);
                          }}
                          disabled={readOnly || !stageConfig?.modelId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="继承默认" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={INHERIT_PARAM_VALUE}>继承模型默认（推荐）</SelectItem>
                            <SelectItem value="low">low</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="high">high</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!readOnly && (
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => { void handleSave(); }}
              disabled={isSaving}
            >
              {isSaving ? "保存中..." : "保存策略"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
