"use client";

import { use, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { PageSection } from "@/components/layout/page-header";
import { THEME_OPTIONS } from "@/theme";
import {
  Cpu,
  Check,
  Loader2,
  Eye,
  EyeOff,
  Zap,
  BookOpen,
  DollarSign
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  patchModel,
  setDefaultModel,
  testModel,
  type AdminModelItem
} from "@/lib/services/models";
import {
  fetchGlobalStrategy,
  saveGlobalStrategy,
  type ModelStrategyInput
} from "@/lib/services/model-strategy";
import { ModelStrategyForm, type EnabledModelItem } from "@/app/admin/_components/model-strategy-form";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */
type LoadingAction = "save" | "default" | "test" | null;

interface ModelDraftState {
  baseUrl    : string;
  apiKey     : string;
  clearApiKey: boolean;
  isEnabled  : boolean;
}

/* ------------------------------------------------
   静态评分数据（sheji 设计中各模型的速度/古文/费用评分）
   当模型来自真实 API 时，以 modelId 匹配评分配置。
   ------------------------------------------------ */
const MODEL_RATINGS: Record<string, { speed: number; classical: number; cost: number }> = {
  "gpt-4o"     : { speed: 3, classical: 4, cost: 3 },
  "gpt-4o-mini": { speed: 5, classical: 3, cost: 1 },
  "claude-3.5" : { speed: 4, classical: 5, cost: 3 },
  "gemini-pro" : { speed: 4, classical: 3, cost: 2 }
};

function getRatings(modelId: string) {
  return MODEL_RATINGS[modelId] ?? { speed: 3, classical: 3, cost: 2 };
}

/* ------------------------------------------------
   Helpers
   ------------------------------------------------ */
function buildInitialDraft(model: AdminModelItem): ModelDraftState {
  return {
    baseUrl    : model.baseUrl,
    apiKey     : "",
    clearApiKey: false,
    isEnabled  : model.isEnabled
  };
}

function resolveCanEnable(model: AdminModelItem, draft: ModelDraftState): boolean {
  if (draft.clearApiKey) return false;
  return model.isConfigured || draft.apiKey.trim().length > 0;
}

/* ------------------------------------------------
   主题预览配置（对齐 sheji 模型设置截图）
   ------------------------------------------------ */
const THEME_PREVIEW_CONFIG: Record<string, {
  description: string;
  barColors  : [string, string, string];
}> = {
  danqing : { description: "深色古风，紫檀深褐，朱砂点缀", barColors: ["bg-[#3d1a1a]", "bg-[#5c2828]", "bg-[#a03030]"] },
  suya    : { description: "暖调浅色，象牙纸底，竹青清雅", barColors: ["bg-[#f5f0e8]", "bg-[#e8e0d0]", "bg-[#4a7a5c]"] },
  diancang: { description: "暗色博物馆，胡桃黑底，黄铜金", barColors: ["bg-[#1a1408]", "bg-[#2a2010]", "bg-[#c9a227]"] },
  xingkong: { description: "深邃暗色，宇宙黑底，银蓝星辉", barColors: ["bg-[#02040a]", "bg-[#08101a]", "bg-[#6b8cae]"] }
};

/* 主题卡片预览组件 */
function ThemePreviewCard({
  value,
  label,
  isSelected,
  onSelect
}: {
  value     : string;
  label     : string;
  isSelected: boolean;
  onSelect  : () => void;
}) {
  const config = THEME_PREVIEW_CONFIG[value] ?? { description: "", barColors: ["bg-muted", "bg-muted", "bg-primary"] };
  const [bg, surface, accent] = config.barColors;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all cursor-pointer w-full text-left",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40 hover:bg-accent/30"
      )}
      aria-pressed={isSelected}
      aria-label={`切换到${label}主题`}
    >
      {/* 迷你 UI 预览 */}
      <div className={cn("w-full rounded overflow-hidden h-14", bg)}>
        <div className={cn("h-2 w-full", surface, "opacity-80")} />
        <div className="p-1.5 space-y-1">
          <div className={cn("h-2 w-3/4 rounded-sm", accent, "opacity-90")} />
          <div className={cn("h-1.5 w-full rounded-sm", surface, "opacity-50")} />
          <div className={cn("h-1.5 w-5/6 rounded-sm", surface, "opacity-35")} />
        </div>
      </div>
      <span className="text-xs font-medium">{label}</span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2">
        {config.description}
      </span>
    </button>
  );
}

/* ------------------------------------------------
   评分条组件（对齐 sheji：5 格小方块）
   ------------------------------------------------ */
function RatingBar({ value, icon: Icon, label, variant = "primary" }: {
  value   : number;
  icon    : React.ElementType;
  label   : string;
  variant?: "primary" | "destructive";
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              "w-3 h-2 rounded-sm",
              i <= value
                ? variant === "destructive" ? "bg-destructive/70" : "bg-primary"
                : "bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function ModelManager({
  initialModelsPromise
}: {
  initialModelsPromise: Promise<AdminModelItem[]>
}) {
  const initialModels = use(initialModelsPromise);
  const { theme, setTheme } = useTheme();

  const [models, setModels] = useState<AdminModelItem[]>(initialModels);
  const [drafts, setDrafts] = useState<Record<string, ModelDraftState>>(
    () => Object.fromEntries(initialModels.map(m => [m.id, buildInitialDraft(m)]))
  );
  const [loadingActions, setLoadingActions] = useState<Record<string, LoadingAction>>(
    () => Object.fromEntries(initialModels.map(m => [m.id, null]))
  );
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [globalStrategy, setGlobalStrategy] = useState<ModelStrategyInput | null>(null);
  const [globalStrategyLoading, setGlobalStrategyLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadGlobalStrategy() {
      setGlobalStrategyLoading(true);
      try {
        const data = await fetchGlobalStrategy();
        if (cancelled) {
          return;
        }
        setGlobalStrategy(data);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "全局策略加载失败");
        }
      } finally {
        if (!cancelled) {
          setGlobalStrategyLoading(false);
        }
      }
    }
    void loadGlobalStrategy();
    return () => { cancelled = true; };
  }, []);

  const sortedModels = [...models].sort(
    (left, right) => Number(right.isDefault) - Number(left.isDefault)
  );

  function updateDraft(modelId: string, updater: (draft: ModelDraftState) => ModelDraftState) {
    setDrafts(currentDrafts => {
      const currentDraft = currentDrafts[modelId];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [modelId]: updater(currentDraft) };
    });
  }

  function setLoading(modelId: string, action: LoadingAction) {
    setLoadingActions(prev => ({ ...prev, [modelId]: action }));
  }

  function replaceModel(nextModel: AdminModelItem) {
    setModels(currentModels =>
      currentModels.map(m => (m.id === nextModel.id ? nextModel : m))
    );
    setDrafts(currentDrafts => ({
      ...currentDrafts,
      [nextModel.id]: buildInitialDraft(nextModel)
    }));
  }

  function toggleApiKeyVisibility(modelId: string) {
    setShowApiKeys(prev => ({ ...prev, [modelId]: !prev[modelId] }));
  }

  async function handleSave(model: AdminModelItem) {
    const draft = drafts[model.id];
    if (!draft) return;

    if (draft.isEnabled && !resolveCanEnable(model, draft)) {
      toast.error("请先配置 API Key，再启用模型");
      return;
    }

    setLoading(model.id, "save");

    const body: Record<string, unknown> = {
      baseUrl  : draft.baseUrl.trim(),
      isEnabled: draft.isEnabled
    };
    if (draft.clearApiKey) body.apiKey = null;
    else if (draft.apiKey.trim()) body.apiKey = draft.apiKey.trim();

    try {
      const updatedModel = await patchModel(model.id, body);
      replaceModel(updatedModel);
      toast.success("保存成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(model.id, null);
    }
  }

  async function handleSetDefault(modelId: string) {
    setLoading(modelId, "default");

    try {
      const updatedModel = await setDefaultModel(modelId);
      setModels(currentModels =>
        currentModels.map(m => ({ ...m, isDefault: m.id === updatedModel.id }))
      );
      toast.success("已设为默认模型");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "设置默认模型失败");
    } finally {
      setLoading(modelId, null);
    }
  }

  async function handleTest(modelId: string) {
    setLoading(modelId, "test");

    try {
      const result = await testModel(modelId);
      toast.success(`连通性测试成功，耗时 ${result.latencyMs} ms`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "连通性测试失败");
    } finally {
      setLoading(modelId, null);
    }
  }

  if (sortedModels.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground text-center">
          当前没有可配置的模型。
        </CardContent>
      </Card>
    );
  }

  const enabledModels = sortedModels.filter(m => {
    const draft = drafts[m.id];
    return draft ? draft.isEnabled : m.isEnabled;
  });
  const strategyEnabledModels: EnabledModelItem[] = models
    .filter(model => model.isEnabled)
    .map(model => ({
      id      : model.id,
      name    : model.name,
      provider: model.provider,
      modelId : model.modelId
    }));

  async function handleSaveGlobalStrategy(strategy: ModelStrategyInput) {
    try {
      await saveGlobalStrategy(strategy);
      setGlobalStrategy(strategy);
      toast.success("全局模型策略保存成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "全局模型策略保存失败");
    }
  }

  return (
    <div className="space-y-8">
      {/* 模型配置 — 2 列卡片网格（对齐 sheji） */}
      <PageSection
        title="模型配置"
        description="配置可用的 AI 模型及其 API 密钥"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedModels.map(model => {
            const draft = drafts[model.id] ?? buildInitialDraft(model);
            const loadingAction = loadingActions[model.id] ?? null;
            const ratings = getRatings(model.modelId);

            return (
              <Card
                key={model.id}
                className={cn("relative", !draft.isEnabled && "opacity-60")}
              >
                {model.isDefault && (
                  <Badge className="absolute -top-2 -right-2 z-10">默认</Badge>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Cpu className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{model.name}</CardTitle>
                        <CardDescription>{model.provider}</CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={draft.isEnabled}
                      disabled={!resolveCanEnable(model, draft) && !draft.isEnabled}
                      onCheckedChange={(checked) =>
                        updateDraft(model.id, d => ({ ...d, isEnabled: checked }))
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 评分条 — 速度 / 古文 / 费用 */}
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <RatingBar value={ratings.speed} icon={Zap} label="速度" />
                    <RatingBar value={ratings.classical} icon={BookOpen} label="古文" />
                    <RatingBar value={ratings.cost} icon={DollarSign} label="费用" variant="destructive" />
                  </div>

                  <Separator />

                  {/* API Key */}
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showApiKeys[model.id] ? "text" : "password"}
                          value={draft.apiKey}
                          placeholder={model.isConfigured ? (model.apiKeyMasked ?? "已配置") : "输入 API Key"}
                          onChange={event => {
                            const nextValue = event.target.value;
                            updateDraft(model.id, d => ({ ...d, apiKey: nextValue, clearApiKey: false }));
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => toggleApiKeyVisibility(model.id)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={showApiKeys[model.id] ? "隐藏 API Key" : "显示 API Key"}
                        >
                          {showApiKeys[model.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Base URL */}
                  <div className="space-y-2">
                    <Label>Base URL（可选）</Label>
                    <Input
                      value={draft.baseUrl}
                      placeholder="使用默认地址"
                      onChange={event => {
                        const nextValue = event.target.value;
                        updateDraft(model.id, d => ({ ...d, baseUrl: nextValue }));
                      }}
                    />
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleTest(model.id)}
                        disabled={loadingAction === "test"}
                      >
                        {loadingAction === "test" ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            测试中
                          </>
                        ) : (
                          "测试连接"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        disabled={loadingAction === "save"}
                        onClick={() => void handleSave(model)}
                      >
                        {loadingAction === "save" ? "保存中..." : "保存"}
                      </Button>
                    </div>
                    {loadingAction === null && model.isConfigured && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-primary" />
                        <span className="text-primary">已配置</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </PageSection>

      {/* 默认模型选择 */}
      <PageSection
        title="默认模型"
        description="选择新书籍导入时默认使用的模型"
      >
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label className="w-32">默认解析模型</Label>
              <Select
                value={sortedModels.find(m => m.isDefault)?.id ?? ""}
                onValueChange={(value: string) => void handleSetDefault(value)}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {enabledModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </PageSection>

      <PageSection
        title="默认解析策略"
        description="配置各解析阶段默认使用的 AI 模型"
      >
        {globalStrategyLoading ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground text-center">
              正在加载全局模型策略...
            </CardContent>
          </Card>
        ) : (
          <ModelStrategyForm
            initialStrategy={globalStrategy}
            availableModels={strategyEnabledModels}
            onSave={handleSaveGlobalStrategy}
            showResetToRecommended
          />
        )}
      </PageSection>

      {/* 主题设置 — 对齐 sheji 模型设置截图 */}
      <PageSection
        title="主题设置"
        description="选择界面显示主题"
      >
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <Label className="w-24 shrink-0 pt-1">界面主题</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                {THEME_OPTIONS.map((opt) => (
                  <ThemePreviewCard
                    key={opt.value}
                    value={opt.value}
                    label={opt.label}
                    isSelected={theme === opt.value}
                    onSelect={() => setTheme(opt.value)}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </PageSection>
    </div>
  );
}
