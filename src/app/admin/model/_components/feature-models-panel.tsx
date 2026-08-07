"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/model/_components/feature-models-panel.tsx`
 * ----------------------------------------------------------------------------
 * 功能点模型管理面板（客户端组件）。
 *
 * v5 模型策略（阶段 4）：9 阶段矩阵已删除，模型按功能点（SKILL_SELECTOR / PIPELINE_MAIN / REVIEW）
 * 全局映射到 `feature_models` 表。每个功能点一行，管理员选择指向的模型；选择“未配置”
 * 即清除映射，运行时由 AiCallExecutor 回退到系统默认模型。
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import {
  fetchFeatureModels,
  upsertFeatureModel,
  type FeatureModelAdminItem
} from "@/lib/services/feature-models";
import type { AdminModelItem } from "@/lib/services/models";

/** Select 中代表“未配置（回退系统默认）”的哨兵值。 */
const INHERIT_MODEL_VALUE = "__INHERIT__";

/**
 * 功能点模型面板组件。
 */
export function FeatureModelsPanel({ enabledModels }: { enabledModels: AdminModelItem[] }) {
  /** 功能点映射列表；null 表示首屏加载中。 */
  const [items, setItems] = useState<FeatureModelAdminItem[] | null>(null);
  /** 加载错误文案。 */
  const [error, setError] = useState<string | null>(null);
  /** 当前正在保存的功能点键（防重复提交）。 */
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFeatureModels()
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "功能点模型加载失败");
      });
    return () => { cancelled = true; };
  }, []);

  async function handleChange(item: FeatureModelAdminItem, value: string) {
    // “未配置”哨兵值映射为 null，表示清除功能点映射（回退系统默认）。
    const nextModelId = value === INHERIT_MODEL_VALUE ? null : value;
    setSavingKey(item.featureKey);
    try {
      const updated = await upsertFeatureModel(item.featureKey, nextModelId);
      setItems((current) => current
        ? current.map((it) => it.featureKey === updated.featureKey ? updated : it)
        : current);
      toast.success(nextModelId ? "功能点模型已更新" : "已清除功能点模型映射（回退默认）");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "功能点模型保存失败");
    } finally {
      setSavingKey(null);
    }
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!items) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          加载功能点模型...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>功能点模型</CardTitle>
        <CardDescription>
          模型按功能点全局映射；未配置的功能点将回退到系统默认模型。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.featureKey} className="rounded-lg border border-border p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">{item.featureLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3 items-end">
              <div className="space-y-2">
                <Label>功能点模型</Label>
                <Select
                  value={item.modelId ?? INHERIT_MODEL_VALUE}
                  onValueChange={(value) => { void handleChange(item, value); }}
                  disabled={savingKey === item.featureKey}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT_MODEL_VALUE}>未配置（回退系统默认）</SelectItem>
                    {enabledModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}（{model.provider} / {model.providerModelId}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground">
                {item.modelId ? `${item.modelName ?? "未知模型"}（${item.provider ?? "未知"}）` : "继承系统默认"}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
