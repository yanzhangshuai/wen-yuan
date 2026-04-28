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
import {
  STAGE_RECOMMENDED_MODELS,
  isRecommendedModelMatch,
  pickRecommendedEnabledModel
} from "@/lib/model-recommendations";
import { cn } from "@/lib/utils";
import type { AnalysisArchitecture } from "@/types/analysis-pipeline";

/**
 * 文件定位（管理端模型策略表单组件）：
 * - 文件路径：`src/app/admin/_components/model-strategy-form.tsx`
 * - 所属层次：前端渲染层（管理后台配置交互组件）。
 *
 * 业务职责：
 * 1) 让管理员按“阶段”配置模型 ID；
 * 2) 支持可选高级参数（temperature、token、重试、thinking 等）；
 * 3) 提供“恢复推荐配置”能力，降低配置门槛和误配风险；
 * 4) 输出标准化 `ModelStrategyInput`，交给上层页面保存到服务端。
 *
 * Next.js / React 语义：
 * - 该组件声明 `"use client"`，因为它依赖大量浏览器端交互状态（展开、输入、选择、保存中等）；
 * - 组件本身不直接发请求，保存逻辑通过 `onSave` 回调上交，保证数据访问职责上移。
 *
 * 上下游关系：
 * - 上游输入：可用模型列表、初始策略、保存回调、只读开关；
 * - 下游输出：规范化后的策略对象（仅保留有 modelId 的阶段）。
 *
 * 维护注意：
 * - 阶段键名来自 `PipelineStage`，属于跨层契约，不可随意改动；
 * - `INHERIT_*` 常量是 Select 组件占位值，不能与真实数据冲突。
 */

/**
 * Select 中代表“继承上级默认模型”的哨兵值。
 * 设计原因：Select 必须有具体 string value，使用特殊值映射“未覆盖”语义。
 */
const INHERIT_MODEL_VALUE = "__INHERIT__";
/**
 * Select 中代表“继承参数默认值”的哨兵值。
 */
const INHERIT_PARAM_VALUE = "__INHERIT_PARAM__";
/** 布尔参数在 Select 中的字符串映射值（开启）。 */
const ENABLE_THINKING_TRUE = "__ENABLE_THINKING_TRUE__";
/** 布尔参数在 Select 中的字符串映射值（关闭）。 */
const ENABLE_THINKING_FALSE = "__ENABLE_THINKING_FALSE__";

/**
 * 表单展示阶段集合：
 * - 包含业务主流程阶段；
 * - 额外包含 `FALLBACK` 作为兜底阶段配置入口。
 */
const STAGES_FOR_FORM: PipelineStage[] = [
  ...BUSINESS_PIPELINE_STAGES,
  PipelineStage.FALLBACK
];

/**
 * 阶段中文标签映射。
 * 业务语义：用于管理员可读展示，不影响后端真实阶段键。
 */
const STAGE_LABELS: Record<PipelineStage, string> = {
  [PipelineStage.ROSTER_DISCOVERY]      : "名册发现",
  [PipelineStage.CHUNK_EXTRACTION]      : "分片提取",
  [PipelineStage.CHAPTER_VALIDATION]    : "章节验证",
  [PipelineStage.TITLE_RESOLUTION]      : "称号溯源",
  [PipelineStage.GRAY_ZONE_ARBITRATION] : "灰区仲裁",
  [PipelineStage.BOOK_VALIDATION]       : "全书验证",
  [PipelineStage.INDEPENDENT_EXTRACTION]: "独立实体提取",
  [PipelineStage.ENTITY_RESOLUTION]     : "全局实体消歧",
  [PipelineStage.FALLBACK]              : "降级兜底（全阶段共享）"
};

export interface EnabledModelItem {
  /** 模型主键（后端模型表 ID）。 */
  id             : string;
  /** 管理端展示名称。 */
  name           : string;
  /** 模型提供商标识。 */
  provider       : string;
  /** 提供商侧模型 ID。 */
  providerModelId: string;
  /** 推荐匹配使用的别名键（可选）。 */
  aliasKey?      : string | null;
}

interface ModelStrategyFormProps {
  /**
   * 初始策略（可选）。
   * - null 表示当前没有阶段级覆盖，将完全继承上层默认策略。
   */
  initialStrategy        : ModelStrategyInput | null;
  /** 当前可选模型列表（通常已过滤为启用模型）。 */
  availableModels        : EnabledModelItem[];
  /**
   * 保存回调。
   * - 输入为已规范化策略；
   * - 返回 Promise 以驱动保存中状态。
   */
  onSave                 : (strategy: ModelStrategyInput) => Promise<void>;
  /** 是否显示“恢复推荐配置”按钮。 */
  showResetToRecommended?: boolean;
  /** 只读模式：用于不可编辑场景。 */
  readOnly?              : boolean;
  /** 当前解析架构；用于隐藏无关阶段。 */
  architecture?          : AnalysisArchitecture;
}

/**
 * 克隆并净化策略：
 * - 仅保留“存在 modelId”的阶段配置；
 * - 过滤掉空壳配置，避免 UI 显示与保存语义不一致。
 */
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

/**
 * 保存前规范化：
 * - 与 `cloneStrategy` 一致，移除未真正配置模型的阶段；
 * - 保证传给上层的 payload 精简且语义明确。
 */
function normalizeStrategy(strategy: ModelStrategyInput, visibleStages: PipelineStage[]): ModelStrategyInput {
  const next: ModelStrategyInput = {};
  for (const stage of visibleStages) {
    const config = strategy[stage];
    if (config?.modelId) {
      next[stage] = { ...config };
    }
  }
  return next;
}

function getVisibleStages(architecture: AnalysisArchitecture): PipelineStage[] {
  if (architecture === "twopass") {
    return STAGES_FOR_FORM.filter((stage) => stage !== PipelineStage.ROSTER_DISCOVERY);
  }

  return STAGES_FOR_FORM.filter((stage) => (
    stage !== PipelineStage.INDEPENDENT_EXTRACTION
    && stage !== PipelineStage.ENTITY_RESOLUTION
  ));
}

/**
 * 将输入框字符串解析为可选数字。
 *
 * 业务语义：
 * - 空串表示“继承默认”，返回 `undefined`；
 * - 非法数字同样回退 `undefined`，避免把 NaN 写入策略。
 */
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
  readOnly = false,
  architecture = "sequential"
}: ModelStrategyFormProps) {
  /** 当前可编辑草稿（本地状态源）。 */
  const [draftStrategy, setDraftStrategy] = useState<ModelStrategyInput>(() => cloneStrategy(initialStrategy));
  /** 高级模式开关：默认关闭，降低误操作概率。 */
  const [advancedModeEnabled, setAdvancedModeEnabled] = useState(false);
  /** 已展开高级参数的阶段集合。 */
  const [expandedStages, setExpandedStages] = useState<Set<PipelineStage>>(new Set());
  /** 保存进行中状态，防重复提交。 */
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // 当上层初始策略变化时重置草稿，保证表单与外部数据源一致。
    setDraftStrategy(cloneStrategy(initialStrategy));
  }, [initialStrategy]);

  const selectableModels = useMemo<EnabledModelItem[]>(() => {
    // 预留 `useMemo` 形态，便于后续在这里集中做排序/过滤扩展。
    return availableModels;
  }, [availableModels]);

  const availableModelById = useMemo(() => {
    // 建立 ID -> 模型映射，避免渲染循环中重复线性查找。
    const mapping = new Map<string, EnabledModelItem>();
    for (const model of selectableModels) {
      mapping.set(model.id, model);
    }
    return mapping;
  }, [selectableModels]);

  const recommendedByStage = useMemo(() => {
    // 每个阶段推荐到“当前可用模型”中的具体实体；若推荐模型未启用则为 null。
    const mapping: Record<PipelineStage, EnabledModelItem | null> = {
      [PipelineStage.ROSTER_DISCOVERY]      : null,
      [PipelineStage.CHUNK_EXTRACTION]      : null,
      [PipelineStage.CHAPTER_VALIDATION]    : null,
      [PipelineStage.TITLE_RESOLUTION]      : null,
      [PipelineStage.GRAY_ZONE_ARBITRATION] : null,
      [PipelineStage.BOOK_VALIDATION]       : null,
      [PipelineStage.INDEPENDENT_EXTRACTION]: null,
      [PipelineStage.ENTITY_RESOLUTION]     : null,
      [PipelineStage.FALLBACK]              : null
    };

    for (const stage of STAGES_FOR_FORM) {
      const rec = STAGE_RECOMMENDED_MODELS[stage];
      if (!rec) {
        mapping[stage] = null;
        continue;
      }

      mapping[stage] = pickRecommendedEnabledModel(rec, selectableModels);
    }

    return mapping;
  }, [selectableModels]);

  const visibleStages = useMemo(() => getVisibleStages(architecture), [architecture]);

  /**
   * 更新某阶段配置的统一入口。
   *
   * 设计原因：
   * - 所有字段更新都经过同一函数，避免状态分叉；
   * - 当阶段没有 `modelId` 时自动删除该阶段，维持“未覆盖即不存在键”的契约。
   */
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

  /**
   * 更新数值类高级参数。
   *
   * 关键规则：
   * - 仅当阶段已选择模型时允许写入；
   * - 空值或非法值会删除该参数键，表示“继承默认”。
   */
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

  /**
   * 更新 enableThinking（布尔）参数。
   */
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

  /**
   * 更新 reasoningEffort 参数。
   *
   * 风险提示（仅注释说明）：
   * - 不同模型供应商支持度不同，配置后不一定都生效；
   * - 当前保留为可选覆盖，默认推荐继承模型平台默认值。
   */
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

  /** 切换某阶段高级参数展开态。 */
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

  /**
   * 切换高级模式。
   * - 关闭高级模式时清空展开集合，避免下次开启出现“上次展开残留”。
   */
  function handleToggleAdvancedMode() {
    setAdvancedModeEnabled((current) => {
      const next = !current;
      if (!next) {
        setExpandedStages(new Set());
      }
      return next;
    });
  }

  /**
   * 一键恢复推荐模型：
   * - 仅覆盖各阶段 `modelId`；
   * - 已填写的高级参数尽量保留，避免用户调优被误清空。
   */
  function resetToRecommended() {
    const next: ModelStrategyInput = { ...draftStrategy };
    for (const stage of visibleStages) {
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

  /**
   * 保存动作：
   * - 先置 saving 锁；
   * - 调用上层 `onSave`；
   * - finally 解锁，确保异常场景也能恢复按钮状态。
   */
  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(normalizeStrategy(draftStrategy, visibleStages));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="model-strategy-form">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>模型策略配置</CardTitle>
          <CardDescription>当前为{architecture === "twopass" ? "两遍式" : "顺序式"}架构，仅显示本架构相关阶段；未选择模型的阶段将使用上级默认配置。</CardDescription>
        </div>
        {showResetToRecommended && !readOnly && (
          /*
           * 分支原因：
           * - 只有在允许展示且非只读模式下才提供“恢复推荐”；
           * - 禁用条件包含“无可用模型”与“保存中”，防止无效点击与并发操作。
           */
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetToRecommended}
            disabled={selectableModels.length === 0 || isSaving}
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
              {/* 让按钮文案直接体现当前状态，降低理解成本。 */}
              {advancedModeEnabled ? "已开启高级模式" : "开启高级模式"}
            </Button>
          </div>
        </div>

        {selectableModels.length === 0 ? (
          /*
           * 空数据分支：
           * - 没有任何可用模型时，编辑行为本质不可完成；
           * - 明确给出下一步路径（去模型管理启用），避免用户卡在当前页。
           */
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-2">
            <p>暂无可用模型，请先在模型管理中启用至少一个模型。</p>
            <Link href="/admin/model" className="interactive-text-link text-primary hover:underline">
              前往模型管理
            </Link>
          </div>
        ) : (
          // 正常分支：渲染每个阶段的模型选择与可选高级参数。
          <div className="space-y-3">
            {visibleStages.map((stage) => {
              const stageConfig = draftStrategy[stage];
              const recommended = recommendedByStage[stage];
              const recommendedMeta = STAGE_RECOMMENDED_MODELS[stage];
              const selectedModel = stageConfig?.modelId
                ? availableModelById.get(stageConfig.modelId)
                : null;
              const selectedIsRecommended = selectedModel
                ? isRecommendedModelMatch(recommendedMeta, selectedModel)
                : false;
              const recommendedAlias = recommendedMeta?.alias;
              const isFallback = stage === PipelineStage.FALLBACK;
              const isExpanded = expandedStages.has(stage);

              return (
                <div
                  key={stage}
                  className={cn(
                    "rounded-lg border border-border p-4 space-y-3",
                    // FALLBACK 阶段承担兜底职责，视觉上单独强调，提示其跨阶段影响范围更大。
                    isFallback && "border-primary/30 bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium">{STAGE_LABELS[stage]}</h4>
                      {isFallback && <Badge variant="secondary">FALLBACK</Badge>}
                    </div>
                    {selectedIsRecommended && (
                      // 已选模型命中推荐时给正向反馈，帮助管理员快速校准配置。
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
                            // 选择“继承”即删除该阶段配置，保持与后端“未覆盖”语义一致。
                            updateStageConfig(stage, () => undefined);
                            return;
                          }

                          // 选择具体模型时保留已有高级参数，只替换 modelId。
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
                          {selectableModels.map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name} ({model.provider} / {model.providerModelId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="text-xs">
                      {recommended ? (
                        <span className="text-muted-foreground">
                          推荐：{recommended.name}
                        </span>
                      ) : (
                        /*
                         * 推荐不可用分支：
                         * - 说明配置文件里有推荐，但当前启用模型中找不到对应项；
                         * - 展示 aliasKey，便于管理员在模型管理页补齐对应别名。
                         */
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {recommendedAlias ? `推荐模型未启用：${recommendedAlias}` : "推荐模型未启用"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {/* 状态提示：让用户清楚当前阶段是“已覆盖”还是“继承上级”。 */}
                      {stageConfig?.modelId ? "已配置当前阶段模型" : "将使用上级默认策略"}
                    </p>
                    {advancedModeEnabled && (
                      // 高级参数只在高级模式下可见，降低普通用户误改风险。
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
                    // 仅在“高级模式 + 已展开阶段”下渲染高级参数输入区，控制信息密度。
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
                          // 没有选模型时禁用：高级参数必须附着在具体模型之上才有意义。
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
          // 只读场景不提供保存入口，避免权限越界或误导用户“可提交”。
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => { void handleSave(); }}
              disabled={isSaving}
            >
              {/* 保存中文案随状态变化，提供即时反馈。 */}
              {isSaving ? "保存中..." : "保存策略"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
