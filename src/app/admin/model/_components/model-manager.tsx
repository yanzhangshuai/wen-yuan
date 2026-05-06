"use client";

/**
 * =============================================================================
 * 文件定位（Admin 模型管理 / 客户端容器）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/admin/model/_components/model-manager.tsx`
 *
 * 设计动机（本次重构）：
 * - 旧版「卡片即表单」与「Modal 新建」并存，导致编辑/保存语义模糊；
 * - 现统一为知识库的范式（参考 `RelationshipTypesPage`）：
 *   1. 卡片仅承载「展示 + 操作」（启用/测试/设为默认/编辑/删除）；
 *   2. 「新建」改为页面顶部内嵌展开的 `ModelForm`；
 *   3. 「编辑」跳转独立路由 `/admin/model/[id]/edit`，复用同一 `ModelForm`。
 * - 主题设置从此处移除（顶栏已有 `ThemeToggle`，避免功能重复）。
 *
 * 边界约束：
 * - 此组件不再持有任何「字段草稿态」，避免与编辑页的真实表单状态冲突；
 * - 列表内的「启用开关」「设为默认」「测试连接」「删除」是独立轻量动作，
 *   直接调用对应服务并回写本地 `models` 即可。
 * =============================================================================
 */

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Plug,
  Plus,
  Upload,
  X
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { PageSection } from "@/components/layout/page-header";
import {
  deleteModel,
  exportModels,
  importModels,
  patchModel,
  setDefaultModel,
  testModel,
  type ExportedModelConfig,
  type AdminModelItem
} from "@/lib/services/models";
import {
  fetchGlobalStrategy,
  saveGlobalStrategy,
  type ModelStrategyInput
} from "@/lib/services/model-strategy";
import { ModelStrategyForm, type EnabledModelItem } from "@/app/admin/_components/model-strategy-form";
import { ModelForm } from "./model-form";
import { ModelCard } from "./model-card";

/* ------------------------------------------------
   Types & Helpers
   ------------------------------------------------ */
type LoadingAction = "default" | "test" | "toggle" | null;

function resolveSortBucket(model: AdminModelItem): number {
  /**
   * 排序分桶（业务规则）：
   * 1. 默认模型优先；2. 已启用；3. 已配置但未启用；4. 未配置。
   */
  if (model.isDefault) return 0;
  if (model.isEnabled) return 1;
  if (model.isConfigured) return 2;
  return 3;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function ModelManager({
  initialModels
}: {
  /** 服务端注入的首屏模型快照。 */
  initialModels: AdminModelItem[]
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [models, setModels] = useState<AdminModelItem[]>(initialModels);
  /** 顶部内嵌「新建模型」表单是否展开。 */
  const [creating, setCreating] = useState(false);
  /** 当前正在编辑的模型 id（卡片内联展开表单）。 */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 每张卡片当前正在执行的轻量异步动作。 */
  const [loadingActions, setLoadingActions] = useState<Record<string, LoadingAction>>(
    () => Object.fromEntries(initialModels.map((m) => [m.id, null]))
  );
  const [isImporting, setImporting] = useState(false);
  const [isExporting, setExporting] = useState(false);
  const [isTestingAll, setTestingAll] = useState(false);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminModelItem | null>(null);

  /** 全局策略（解析策略 Tab）。 */
  const [globalStrategy, setGlobalStrategy] = useState<ModelStrategyInput | null>(null);
  const [globalStrategyLoading, setGlobalStrategyLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadGlobalStrategy() {
      setGlobalStrategyLoading(true);
      try {
        const data = await fetchGlobalStrategy();
        if (cancelled) return;
        setGlobalStrategy(data);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "全局策略加载失败");
        }
      } finally {
        if (!cancelled) setGlobalStrategyLoading(false);
      }
    }
    void loadGlobalStrategy();
    return () => { cancelled = true; };
  }, []);

  function setLoading(modelId: string, action: LoadingAction) {
    setLoadingActions((prev) => ({ ...prev, [modelId]: action }));
  }

  function upsertModel(next: AdminModelItem) {
    setModels((current) => {
      const exists = current.some((m) => m.id === next.id);
      if (exists) {
        return current.map((m) => (m.id === next.id
          ? { ...next, performance: m.performance }
          : m));
      }
      return [...current, next];
    });
    setLoadingActions((current) => ({ ...current, [next.id]: current[next.id] ?? null }));
  }

  const sortedModels = [...models].sort((left, right) => {
    const leftBucket = resolveSortBucket(left);
    const rightBucket = resolveSortBucket(right);
    if (leftBucket !== rightBucket) return leftBucket - rightBucket;
    return left.name.localeCompare(right.name, "zh-CN");
  });
  const groupedModels = sortedModels.reduce<Array<{ provider: string; models: AdminModelItem[] }>>((groups, model) => {
    const existingGroup = groups.find((group) => group.provider === model.provider);
    if (existingGroup) {
      existingGroup.models.push(model);
      return groups;
    }
    groups.push({ provider: model.provider, models: [model] });
    return groups;
  }, []);
  const enabledModels = sortedModels.filter((m) => m.isEnabled);
  const strategyEnabledModels: EnabledModelItem[] = models
    .filter((model) => model.isEnabled)
    .map((model) => ({
      id               : model.id,
      name             : model.name,
      provider         : model.provider,
      providerModelId  : model.providerModelId,
      aliasKey         : model.aliasKey,
      supportsThinking : model.supportsThinking,
      supportsWebSearch: model.supportsWebSearch
    }));

  /* ------------ 卡片轻量动作 ------------ */
  async function handleToggleEnabled(model: AdminModelItem, nextEnabled: boolean) {
    /**
     * 业务约束：
     * - 启用模型必须已配置 API Key，否则提示用户去编辑页配置；
     * - 该规则与 `ModelForm` 校验保持一致。
     */
    if (nextEnabled && !model.isConfigured) {
      toast.error("请先在编辑页配置 API Key，再启用此模型");
      return;
    }
    setLoading(model.id, "toggle");
    try {
      const updated = await patchModel(model.id, { isEnabled: nextEnabled });
      upsertModel(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换启用状态失败");
    } finally {
      setLoading(model.id, null);
    }
  }

  async function handleTest(modelId: string) {
    setLoading(modelId, "test");
    try {
      const result = await testModel(modelId);
      if (result.success) {
        const latencyMessage = typeof result.latencyMs === "number"
          ? `，耗时 ${result.latencyMs} ms`
          : "";
        toast.success(`连通性测试成功${latencyMessage}`);
      } else {
        toast.error(result.errorMessage ?? result.detail);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "连通性测试失败");
    } finally {
      setLoading(modelId, null);
    }
  }

  async function handleSetDefault(modelId: string) {
    setLoading(modelId, "default");
    try {
      const updated = await setDefaultModel(modelId);
      setModels((current) =>
        current.map((m) => ({ ...m, isDefault: m.id === updated.id }))
      );
      toast.success("已设为默认模型");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "设置默认模型失败");
    } finally {
      setLoading(modelId, null);
    }
  }

  async function handleDeleteModel(model: AdminModelItem) {
    setDeletingModelId(model.id);
    try {
      await deleteModel(model.id);
      setModels((current) => current.filter((currentModel) => currentModel.id !== model.id));
      setDeleteTarget(null);
      toast.success("模型已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除模型失败");
    } finally {
      setDeletingModelId(null);
    }
  }

  /* ------------ 批量连通性测试 ------------ */
  /**
   * 为所有已配置 API Key 的模型并行调用 testModel。
   *
   * 设计考量：
   * - 并行调用（Promise.all）以缩短整体等待；不同模型多对应不同供应商，
   *   通常不会触发同一账号的限流；
   * - 单个失败不影响整体流程，最后汇总提示；
   * - 测试中锁定全局按钮 + 各卡片 test 动作，避免重复触发。
   */
  async function handleTestAll() {
    const targets = models.filter((model) => model.isConfigured);
    if (targets.length === 0) {
      toast.error("没有已配置 API Key 的模型可测试");
      return;
    }
    setTestingAll(true);
    setLoadingActions((prev) => {
      const next = { ...prev };
      for (const model of targets) next[model.id] = "test";
      return next;
    });
    try {
      const results = await Promise.all(
        targets.map(async (model) => {
          try {
            const result = await testModel(model.id);
            return {
              model,
              success: result.success,
              message: result.errorMessage ?? result.detail
            };
          } catch (error) {
            return {
              model,
              success: false,
              message: error instanceof Error ? error.message : "请求异常"
            };
          }
        })
      );
      const succeeded = results.filter((item) => item.success).length;
      const failures = results.filter((item) => !item.success);
      if (failures.length === 0) {
        toast.success(`全部成功：${succeeded}/${targets.length} 个模型连通。`);
      } else {
        const detail = failures
          .slice(0, 5)
          .map((item) => `${item.model.name}：${item.message}`)
          .join("\n");
        toast.error(`成功 ${succeeded}，失败 ${failures.length}。\n${detail}${failures.length > 5 ? "\n…" : ""}`);
      }
    } finally {
      setLoadingActions((prev) => {
        const next = { ...prev };
        for (const model of targets) {
          if (next[model.id] === "test") next[model.id] = null;
        }
        return next;
      });
      setTestingAll(false);
    }
  }

  /* ------------ 导入/导出 ------------ */
  async function handleExportModels() {
    setExporting(true);
    try {
      const exportedModels = await exportModels();
      const blob = new Blob([JSON.stringify(exportedModels, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ai-models-export.json";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("模型配置已导出");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出模型配置失败");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("导入文件必须是模型配置数组");
      const result = await importModels(parsed as ExportedModelConfig[]);
      setModels(result.models);
      setLoadingActions(Object.fromEntries(result.models.map((model) => [model.id, null])));
      toast.success(`导入完成：新增 ${result.created} 个，更新 ${result.updated} 个`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入模型配置失败");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  /* ------------ 解析策略 ------------ */
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
    <Tabs defaultValue="model-config" className="space-y-6">
      <TabsList>
        <TabsTrigger value="model-config">模型配置</TabsTrigger>
        <TabsTrigger value="strategy">解析策略</TabsTrigger>
      </TabsList>

      <TabsContent value="model-config" className="space-y-8">
        <PageSection
          title="模型配置"
          description="配置可用的 AI 模型及其 API 密钥"
        >
          <div className="space-y-5">
            {/* 顶部操作栏 */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => setCreating(true)}
                disabled={creating}
              >
                <Plus className="mr-2 h-4 w-4" />
                新增模型
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleTestAll()}
                disabled={isTestingAll || models.every((model) => !model.isConfigured)}
              >
                <Plug className="mr-2 h-4 w-4" />
                {isTestingAll ? "测试中…" : "测试所有连接"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExportModels()}
                disabled={isExporting}
              >
                <Download className="mr-2 h-4 w-4" />
                导出
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => importInputRef.current?.click()}
                disabled={isImporting}
              >
                <Upload className="mr-2 h-4 w-4" />
                导入
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImportFile(file);
                }}
              />
            </div>

            {/* 内嵌新增表单（参考知识库范式） */}
            {creating && (
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">新增模型</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      默认已预填 DeepSeek 官方 OpenAI-compatible endpoint，可按需修改。
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="关闭新增表单"
                    onClick={() => setCreating(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <ModelForm
                  initial={null}
                  onSuccess={(created) => {
                    upsertModel(created);
                    setCreating(false);
                  }}
                  onCancel={() => setCreating(false)}
                />
              </div>
            )}

            {/* 模型卡片列表 */}
            {groupedModels.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>添加第一个模型</CardTitle>
                  <CardDescription>默认已预填 DeepSeek 官方 OpenAI-compatible endpoint，可直接填写 API Key 后添加。</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setCreating(true)} disabled={creating}>
                    <Plus className="mr-2 h-4 w-4" />
                    添加第一个模型
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {groupedModels.map((group) => (
                  <Collapsible key={group.provider} defaultOpen className="rounded-lg border bg-card/40">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="group h-auto w-full justify-start gap-2 rounded-lg px-4 py-3 hover:bg-accent/40"
                      >
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                        <span className="text-sm font-semibold">{group.provider}</span>
                        <Badge variant="secondary">{group.models.length}</Badge>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4 pt-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {group.models.map((model) => (
                          <ModelCard
                            key={model.id}
                            model={model}
                            editing={editingId === model.id}
                            loadingAction={loadingActions[model.id] ?? null}
                            isDeleting={deletingModelId === model.id}
                            onEditStart={() => setEditingId(model.id)}
                            onEditCancel={() => setEditingId(null)}
                            onSaved={(updated) => {
                              upsertModel(updated);
                              setEditingId(null);
                            }}
                            onTest={() => void handleTest(model.id)}
                            onSetDefault={() => void handleSetDefault(model.id)}
                            onToggleEnabled={(checked) => void handleToggleEnabled(model, checked)}
                            onDelete={() => setDeleteTarget(model)}
                          />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            )}
          </div>
        </PageSection>

        {/* 默认模型选择（保留快速切换入口） */}
        <PageSection
          title="默认模型"
          description="选择新书籍导入时默认使用的模型"
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Label className="w-32">默认解析模型</Label>
                <Select
                  value={sortedModels.find((m) => m.isDefault)?.id ?? ""}
                  onValueChange={(value: string) => void handleSetDefault(value)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="选择默认模型" />
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
      </TabsContent>

      <TabsContent value="strategy">
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
      </TabsContent>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && deletingModelId === null) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除模型</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除模型「{deleteTarget?.name ?? ""}」？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletingModelId !== null}
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingModelId !== null || !deleteTarget}
              onClick={() => {
                if (deleteTarget) void handleDeleteModel(deleteTarget);
              }}
            >
              {deletingModelId !== null ? "删除中..." : "删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}
