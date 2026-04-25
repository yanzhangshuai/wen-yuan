"use client";

/**
 * =============================================================================
 * 文件定位（Admin 客户端容器组件）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/admin/model/_components/model-manager.tsx`
 *
 * 组件角色：
 * - 这是模型管理页的核心 Client Component（容器组件）；
 * - 负责承接管理员交互：编辑模型配置、设置默认模型、连通性测试、排序筛选与保存提交。
 *
 * 为什么必须是 `use client`：
 * - 该组件依赖 `useState/useEffect`、实时表单输入、按钮异步 loading、toast 反馈；
 * - 这些都属于浏览器交互行为，不能放在 Server Component 中执行。
 *
 * 上下游关系：
 * - 上游：`/app/admin/model/page.tsx` 页面入口；
 * - 下游：`@/lib/services/models`（调用后端 Route Handler）与 UI 基础组件库。
 *
 * 维护边界：
 * - 此文件承载较多“页面交互状态机”逻辑，字段联动（是否可启用/是否可保存）是业务规则；
 * - 调整默认值或按钮可用条件前，需要同步验证后端契约与管理员操作路径。
 * =============================================================================
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { PageSection } from "@/components/layout/page-header";
import { useHydratedTheme } from "@/hooks/use-hydrated-theme";
import { THEME_OPTIONS } from "@/theme";
import {
  ChevronDown,
  Check,
  Cpu,
  DollarSign,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteAdminModel,
  patchModel,
  setDefaultModel,
  testModel,
  type AdminModelItem
} from "@/lib/services/models";
import { AddModelDialog } from "./add-model-dialog";
import {
  fetchGlobalStrategy,
  saveGlobalStrategy,
  type ModelStrategyInput
} from "@/lib/services/model-strategy";
import { ModelStrategyForm, type EnabledModelItem } from "@/app/admin/_components/model-strategy-form";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */
/**
 * 当前模型卡片正在执行的异步动作类型。
 *
 * 业务语义：
 * - `save`：保存模型配置；
 * - `default`：设置为默认模型；
 * - `test`：执行连通性测试；
 * - `null`：空闲态。
 *
 * 设计原因：
 * - 使用离散联合类型而不是布尔值，可以避免“同一时刻多个按钮 loading 冲突”的歧义。
 */
type LoadingAction = "save" | "default" | "test" | null;

/**
 * 模型草稿态（仅存在前端，用于编辑未提交的数据）。
 *
 * 与后端模型实体的关系：
 * - 后端 `AdminModelItem` 是已保存的真实状态；
 * - `ModelDraftState` 是用户在当前页面会话中的临时编辑态。
 */
interface ModelDraftState {
  /** 模型标识（例如 deepseek-chat / qwen-plus），由管理员输入并提交给后端。 */
  providerModelId: string;
  /** 自定义 API 网关地址；为空表示使用后端默认地址。 */
  baseUrl        : string;
  /** 新输入的 API Key（仅前端暂存，不回填已保存明文）。 */
  apiKey         : string;
  /** 是否清空已保存 API Key；用于显式表达“删除密钥”这一操作意图。 */
  clearApiKey    : boolean;
}

/* ------------------------------------------------
   Helpers
   ------------------------------------------------ */
function buildInitialDraft(model: AdminModelItem): ModelDraftState {
  /**
   * 业务目的：
   * - 以当前后端模型快照初始化前端草稿态，保证“编辑前即真实状态”。
   *
   * 关键设计：
   * - `apiKey` 初始置空，而不是回显后端值，这是安全边界（避免密钥泄露到前端）。
   */
  return {
    providerModelId: model.providerModelId,
    baseUrl        : model.baseUrl,
    apiKey         : "",
    clearApiKey    : false
  };
}

function resolveCanEnable(model: AdminModelItem, draft: ModelDraftState): boolean {
  /**
   * 业务规则（不是技术限制）：
   * - 当用户勾选“清空 API Key”时，必须禁止启用模型；
   * - 只有“已配置过密钥”或“本次输入了新密钥”才能启用。
   */
  if (draft.clearApiKey) return false;
  return model.isConfigured || draft.apiKey.trim().length > 0;
}

function formatSuccessRate(successRate: number | null): string {
  /**
   * 防御性处理：
   * - `null` 表示后端暂无样本数据，不能误导展示为 `0%`（含义不同）。
   */
  if (successRate === null) {
    return "暂无数据";
  }
  return `${Math.round(successRate * 100)}%`;
}

function resolveSortBucket(model: AdminModelItem): number {
  /**
   * 排序分桶策略（业务规则）：
   * 1. 默认模型优先展示；
   * 2. 其次展示已启用模型（方便高频运维）；
   * 3. 再展示已配置但未启用模型；
   * 4. 最后是未配置模型。
   *
   * 设计原因：
   * - 只依赖服务端状态排序，避免草稿变化触发重排导致卡片位置跳变。
   */
  if (model.isDefault) return 0;
  if (model.isEnabled) return 1;
  if (model.isConfigured) return 2;
  return 3;
}

/* ------------------------------------------------
   主题预览配置（对齐 sheji 模型设置截图）
   ------------------------------------------------ */
const THEME_PREVIEW_CONFIG: Record<string, {
  /** 主题说明文案，用于帮助管理员理解视觉风格差异。 */
  description: string;
  /** 预览卡片中的三段色条：背景层 / 表面层 / 强调色。 */
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
  /** 主题唯一值（与 `THEME_OPTIONS` 的 value 对齐）。 */
  value     : string;
  /** 主题展示名称。 */
  label     : string;
  /** 当前是否已选中该主题，用于驱动选中态样式与 aria 状态。 */
  isSelected: boolean;
  /** 用户点击卡片时触发的主题切换回调。 */
  onSelect  : () => void;
}) {
  /**
   * 防御性回退：
   * - 若主题值暂未配置预览信息，降级到中性色方案，避免界面崩溃。
   */
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
  /** 评分值（1~5），由后端性能画像计算后下发。 */
  value   : number;
  /** 指标图标组件（速度/稳定/费用）。 */
  icon    : React.ElementType;
  /** 指标名称。 */
  label   : string;
  /** 视觉语义：`destructive` 用于费用等“越高越需要警惕”的指标。 */
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
  initialModels
}: {
  /**
   * 页面首屏模型列表（来自上游 Server Component）。
   *
   * Next.js 链路语义：
   * - 由服务端先拿到初始数据再注入客户端容器，减少首屏空白等待。
   */
  initialModels: AdminModelItem[]
}) {
  const { setTheme, selectedTheme, isHydrated } = useHydratedTheme();

  /** 当前模型真实快照（以“保存成功后的后端返回”作为最终真值）。 */
  const [models, setModels] = useState<AdminModelItem[]>(initialModels);
  /** 每个模型的前端草稿态，key 为模型 id。 */
  const [drafts, setDrafts] = useState<Record<string, ModelDraftState>>(
    () => Object.fromEntries(initialModels.map(m => [m.id, buildInitialDraft(m)]))
  );
  /** 每个模型当前正在执行的异步动作，用于精准控制按钮 loading/disabled。 */
  const [loadingActions, setLoadingActions] = useState<Record<string, LoadingAction>>(
    () => Object.fromEntries(initialModels.map(m => [m.id, null]))
  );
  /** API Key 显示/隐藏状态，仅影响本地 UI，不参与业务提交。 */
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  /** 新增模型对话框的开关状态。 */
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  /** 当前触发删除确认弹窗的模型 ID；null 表示未激活。 */
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  /** 已折叠的供应商分组 key 集合。 */
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());
  /** 全局策略表单数据；`null` 表示尚未获取完成。 */
  const [globalStrategy, setGlobalStrategy] = useState<ModelStrategyInput | null>(null);
  /** 全局策略加载状态；用于展示加载态与避免提前渲染表单。 */
  const [globalStrategyLoading, setGlobalStrategyLoading] = useState(true);

  useEffect(() => {
    /**
     * `cancelled` 防御目的：
     * - 防止组件卸载后异步请求回写状态，避免 React 警告与潜在内存泄漏。
     */
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
        /**
         * 错误处理策略：
         * - 不中断页面其余功能，仅通过 toast 提示管理员；
         * - 这是“局部失败可降级”的后台可用性设计。
         */
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

  const sortedModels = [...models].sort((left, right) => {
    /**
     * 排序规则优先按业务分桶，再按中文名称排序。
     * - 先保障“操作优先级”，再保障“查找效率”。
     */
    const leftBucket = resolveSortBucket(left);
    const rightBucket = resolveSortBucket(right);
    if (leftBucket !== rightBucket) {
      return leftBucket - rightBucket;
    }
    return left.name.localeCompare(right.name, "zh-CN");
  });

   
  const modelsByProvider = useMemo((): [string, AdminModelItem[]][] => {
    /** 按供应商将 sortedModels 分组，保持 sortedModels 内顺序。 */
    const map = new Map<string, AdminModelItem[]>();
    for (const model of sortedModels) {
      const group = map.get(model.provider) ?? [];
      group.push(model);
      map.set(model.provider, group);
    }
    return Array.from(map.entries());
  }, [sortedModels]);

  function updateDraft(modelId: string, updater: (draft: ModelDraftState) => ModelDraftState) {
    /**
     * 防御性分支：
     * - 若草稿不存在（极端情况下的状态不同步），保持原状态不抛错，避免页面中断。
     */
    setDrafts(currentDrafts => {
      const currentDraft = currentDrafts[modelId];
      if (!currentDraft) return currentDrafts;
      return { ...currentDrafts, [modelId]: updater(currentDraft) };
    });
  }

  function setLoading(modelId: string, action: LoadingAction) {
    /** 统一 loading 写入口，确保同一模型按钮状态变更一致。 */
    setLoadingActions(prev => ({ ...prev, [modelId]: action }));
  }

  function replaceModel(nextModel: AdminModelItem) {
    /**
     * 保存成功后的状态回写策略：
     * - 以服务端返回覆盖本地模型字段，避免前后端状态漂移；
     * - `performance` 保留旧值，避免后端未回传画像时导致页面信息闪烁。
     */
    setModels(currentModels =>
      currentModels.map((model) => (model.id === nextModel.id
        ? { ...nextModel, performance: model.performance }
        : model))
    );
    setDrafts(currentDrafts => ({
      ...currentDrafts,
      [nextModel.id]: buildInitialDraft(nextModel)
    }));
  }

  function toggleApiKeyVisibility(modelId: string) {
    /** 切换密钥可见性仅影响 UI，不触发任何网络请求。 */
    setShowApiKeys(prev => ({ ...prev, [modelId]: !prev[modelId] }));
  }

  function handleToggleProvider(provider: string) {
    /** 切换某供应商分组的展开/折叠状态。 */
    setCollapsedProviders(prev => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  }

  function handleAddModel(item: AdminModelItem) {
    /** 新增模型成功后将其追加到本地模型列表并初始化草稿与加载状态。 */
    setModels(prev => [...prev, item]);
    setDrafts(prev => ({ ...prev, [item.id]: buildInitialDraft(item) }));
    setLoadingActions(prev => ({ ...prev, [item.id]: null }));
  }

  async function handleDeleteModel(id: string) {
    try {
      await deleteAdminModel(id);
      setModels(prev => prev.filter(m => m.id !== id));
      setDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setLoadingActions(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDeletingModelId(null);
      toast.success("模型已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
      setDeletingModelId(null);
    }
  }

  async function handleSave(model: AdminModelItem) {
    const draft = drafts[model.id];
    /** 防御性判空：草稿不存在时直接退出，避免提交脏数据。 */
    if (!draft) return;

    /** 业务校验：模型标识是后端识别目标模型的核心字段，必须非空。 */
    if (!draft.providerModelId.trim()) {
      toast.error("模型标识不能为空");
      return;
    }

    setLoading(model.id, "save");

    const body: Record<string, unknown> = {
      providerModelId: draft.providerModelId.trim(),
      baseUrl        : draft.baseUrl.trim()
    };
    /**
     * 分支语义：
     * - `clearApiKey` 为真时明确传 `null`，表示“删除密钥”；
     * - 否则仅在用户输入了新密钥时传递，避免无意覆盖。
     */
    if (draft.clearApiKey) body.apiKey = null;
    else if (draft.apiKey.trim()) body.apiKey = draft.apiKey.trim();

    try {
      const updatedModel = await patchModel(model.id, body);
      replaceModel(updatedModel);
      toast.success("保存成功");
    } catch (error) {
      /** 异常兜底：优先展示后端可读错误，其次展示通用提示。 */
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(model.id, null);
    }
  }

  async function handleSetDefault(modelId: string) {
    /** 业务动作：将某模型设为全局默认，影响“新书籍导入”的默认解析模型。 */
    setLoading(modelId, "default");

    try {
      const updatedModel = await setDefaultModel(modelId);
      setModels(currentModels =>
        /**
         * 业务约束：默认模型全局唯一。
         * - 因此采用“全量重算 isDefault”而不是只更新单项。
         */
        currentModels.map(m => ({ ...m, isDefault: m.id === updatedModel.id }))
      );
      toast.success("已设为默认模型");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "设置默认模型失败");
    } finally {
      setLoading(modelId, null);
    }
  }

  async function handleToggleEnabled(model: AdminModelItem) {
    /** 开启/关闭模型：无需点击"保存"，直接调用 API 立即生效。 */
    const nextEnabled = !model.isEnabled;
    if (nextEnabled && !model.isConfigured) {
      toast.error("请先配置 API Key，再启用模型");
      return;
    }
    setLoading(model.id, "save");
    try {
      const updatedModel = await patchModel(model.id, { isEnabled: nextEnabled });
      replaceModel(updatedModel);
      toast.success(nextEnabled ? "模型已启用" : "模型已关闭");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setLoading(model.id, null);
    }
  }

  async function handleTest(modelId: string) {
    /** 业务动作：验证模型连通性，降低管理员误配置带来的线上故障风险。 */
    setLoading(modelId, "test");

    try {
      const result = await testModel(modelId);
      if (result.success) {
        /** 仅在后端回传耗时时拼接文案，避免出现“undefined ms”噪音。 */
        const latencyMessage = typeof result.latencyMs === "number"
          ? `，耗时 ${result.latencyMs} ms`
          : "";
        toast.success(`连通性测试成功${latencyMessage}`);
      } else {
        /** 优先展示后端细粒度错误，帮助管理员定位配置问题。 */
        toast.error(result.errorMessage ?? result.detail);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "连通性测试失败");
    } finally {
      setLoading(modelId, null);
    }
  }



  /**
   * 可用于"默认模型"下拉的模型列表：
   * - 过滤条件改为 `isConfigured`（已配置 API Key），而非 `isEnabled`；
   * - 这样用户只要填了 Key 即可在此选择，无需额外手动开启"启用"开关。
   * - 同时兼容草稿态：若当前草稿已输入 API Key，也纳入候选。
   */
  const enabledModels = sortedModels.filter(m => {
    const draft = drafts[m.id];
    const draftHasKey = draft ? draft.apiKey.trim() !== "" : false;
    return m.isConfigured || draftHasKey;
  });
  /**
   * 可用于"解析策略"选择的模型列表：
   * - 同样改为 `isConfigured`，与"默认模型"下拉保持一致。
   */
  const strategyEnabledModels: EnabledModelItem[] = models
    .filter(model => model.isConfigured)
    .map(model => ({
      id             : model.id,
      name           : model.name,
      provider       : model.provider,
      providerModelId: model.providerModelId,
      aliasKey       : model.aliasKey
    }));
  async function handleSaveGlobalStrategy(strategy: ModelStrategyInput) {
    /** 保存“多阶段解析策略”的全局默认配置。 */
    try {
      await saveGlobalStrategy(strategy);
      setGlobalStrategy(strategy);
      toast.success("全局模型策略保存成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "全局模型策略保存失败");
    }
  }

  return (
    /**
     * 业务约定：
     * - 默认进入“模型配置”而非“解析策略”，因为这是管理员最高频入口。
     */
    <Tabs
      defaultValue="model-config"
      className="space-y-6"
    >
      <TabsList>
        <TabsTrigger value="model-config">模型配置</TabsTrigger>
        <TabsTrigger value="strategy">解析策略</TabsTrigger>
      </TabsList>

      <TabsContent
        value="model-config"
        className="space-y-8"
      >
        <PageSection
          title="模型配置"
          description="配置可用的 AI 模型及其 API 密钥"
        >
          {/* 新增模型按钮 */}
          <div className="flex justify-end mb-4">
            <Button
              size="sm"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              新增模型
            </Button>
          </div>

          {/* 按供应商分组展示 */}
          {models.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground text-center">
                当前没有可配置的模型，点击「新增模型」按钮创建第一个模型。
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              { }
              {modelsByProvider.map(([provider, providerModels]: [string, AdminModelItem[]]) => (
                <div key={provider}>
                  {/* 供应商分组标题 */}
                  <button
                    type="button"
                    onClick={() => handleToggleProvider(provider)}
                    className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        collapsedProviders.has(provider) && "-rotate-90"
                      )}
                    />
                    <span className="capitalize">{provider}</span>
                    <Badge variant="secondary" className="text-xs">
                      {providerModels.length}
                    </Badge>
                  </button>

                  {/* 折叠控制：折叠时不渲染内容 */}
                  {!collapsedProviders.has(provider) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {providerModels.map((model: AdminModelItem) => {
                        const draft = drafts[model.id] ?? buildInitialDraft(model);
                        const loadingAction = loadingActions[model.id] ?? null;
                        const ratings = model.performance.ratings;

                        return (
                          <div key={model.id}>
                            <Card className={cn("relative", !model.isEnabled && "opacity-60")}>
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
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={model.isEnabled}
                                      disabled={loadingAction !== null || (!model.isConfigured && !model.isEnabled)}
                                      onCheckedChange={() => void handleToggleEnabled(model)}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setDeletingModelId(model.id)}
                                      className="text-muted-foreground hover:text-destructive transition-colors"
                                      aria-label={`删除模型 ${model.name}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {/* 评分条 — 速度 / 稳定 / 费用 */}
                                <div className="grid grid-cols-3 gap-4 text-xs">
                                  <RatingBar value={ratings.speed} icon={Zap} label="速度" />
                                  <RatingBar value={ratings.stability} icon={Check} label="稳定" />
                                  <RatingBar value={ratings.cost} icon={DollarSign} label="费用" variant="destructive" />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  样本 {model.performance.callCount} 次 · 成功率 {formatSuccessRate(model.performance.successRate)}
                                </p>

                                <Separator />

                                {/* 模型标识 */}
                                <div className="space-y-2">
                                  <Label>模型标识</Label>
                                  <Input
                                    value={draft.providerModelId}
                                    placeholder="例如 deepseek-chat / qwen-plus / ep-xxxx"
                                    onChange={event => {
                                      const nextValue = event.target.value;
                                      updateDraft(model.id, d => ({ ...d, providerModelId: nextValue }));
                                    }}
                                  />
                                  {model.provider === "doubao" && (
                                    <p className="text-xs text-amber-600">
                                      豆包请填写方舟控制台中的 Endpoint/模型标识（通常不是 doubao-pro）。
                                    </p>
                                  )}
                                </div>

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

                            {/* 删除确认对话框：每张卡片独立挂载，对应其 deletingModelId 状态 */}
                            <AlertDialog
                              open={deletingModelId === model.id}
                              onOpenChange={(open) => { if (!open) setDeletingModelId(null); }}
                            >
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>确认删除模型？</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    此操作不可撤销，将永久删除「{model.name}」的所有配置。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => void handleDeleteModel(model.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    删除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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

        {/* 主题设置 — 对齐 sheji 模型设置截图 */}
        <PageSection
          title="主题设置"
          description="选择界面显示主题"
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <Label className="w-24 shrink-0 pt-1">界面主题</Label>
                {/**
                  * 仅在 hydration 完成后展示真实可交互主题选择，
                  * 避免 SSR 与 CSR 的主题差异造成闪烁或 hydration mismatch。
                  */}
                {isHydrated ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                    {THEME_OPTIONS.map((opt) => (
                      <ThemePreviewCard
                        key={opt.value}
                        value={opt.value}
                        label={opt.label}
                        isSelected={selectedTheme === opt.value}
                        onSelect={() => setTheme(opt.value)}
                      />
                    ))}
                  </div>
                ) : (
                  /**
                   * 未 hydration 前展示骨架占位，保证首屏结构稳定且不触发可交互操作。
                   */
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                    {THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className="flex flex-col items-center gap-2 p-3 rounded-lg border-2 border-border opacity-60 cursor-default w-full text-left"
                        aria-hidden="true"
                        tabIndex={-1}
                      >
                        <div className="w-full rounded overflow-hidden h-14 bg-muted" />
                        <span className="text-xs font-medium">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </PageSection>
      </TabsContent>

      <TabsContent value="strategy">
        <PageSection
          title="默认解析策略"
          description="配置各解析阶段默认使用的 AI 模型"
        >
          {globalStrategyLoading ? (
            /**
             * 加载态分支：
             * - 在策略数据未就绪前不渲染表单，避免用户编辑到无效初始值。
             */
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
      </TabsContent>

      {/* 新增模型对话框 */}
      <AddModelDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={handleAddModel}
      />
    </Tabs>
  );
}
