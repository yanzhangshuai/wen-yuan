"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/_components/book-strategy-panel.tsx`
 * ----------------------------------------------------------------------------
 * 这是书籍详情页“模型策略”面板（客户端组件）。
 *
 * 核心职责：
 * - 同时加载“可选模型列表”与“书籍级策略”；
 * - 将数据适配为 `ModelStrategyForm` 所需结构；
 * - 在保存后持久化到书籍级策略接口。
 *
 * 业务定位：
 * - 这是书籍维度策略管理入口，优先级高于全局默认策略；
 * - 修改该策略会影响后续该书的解析任务模型选择。
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { ModelStrategyForm, type EnabledModelItem } from "@/app/admin/_components/model-strategy-form";
import { fetchModels } from "@/lib/services/models";
import {
  fetchBookStrategy,
  saveBookStrategy,
  type ModelStrategyInput
} from "@/lib/services/model-strategy";

/**
 * 组件入参。
 */
interface BookStrategyPanelProps {
  /** 书籍 ID，用于读写 BOOK 级模型策略。 */
  bookId: string;
}

/**
 * 书籍策略面板组件（容器型客户端组件）。
 */
export function BookStrategyPanel({ bookId }: BookStrategyPanelProps) {
  /** 当前书籍策略；null 表示“未配置（走上游回退规则）”。 */
  const [strategy, setStrategy] = useState<ModelStrategyInput | null>(null);

  /** 可供选择的启用模型列表（经过映射后的表单输入模型）。 */
  const [availableModels, setAvailableModels] = useState<EnabledModelItem[]>([]);

  /** 首屏加载状态。 */
  const [loading, setLoading] = useState(true);

  /** 首屏加载错误。 */
  const [error, setError] = useState<string | null>(null);

  /**
   * 初始化并行加载：
   * 1) 所有模型配置（随后过滤启用模型）
   * 2) 该书当前策略
   *
   * 使用 `cancelled` 规避组件卸载后的状态回写。
   */
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [allModels, bookStrategy] = await Promise.all([
          fetchModels(),
          fetchBookStrategy(bookId)
        ]);
        if (cancelled) {
          return;
        }

        // 只允许展示启用模型，避免管理员配置到不可用模型导致任务失败。
        setAvailableModels(
          allModels
            .filter((model) => model.isEnabled)
            .map((model) => ({
              id             : model.id,
              name           : model.name,
              provider       : model.provider,
              providerModelId: model.providerModelId,
              aliasKey       : model.aliasKey
            }))
        );
        setStrategy(bookStrategy);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "模型策略加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();
    return () => { cancelled = true; };
  }, [bookId]);

  /**
   * 保存策略。
   *
   * @param nextStrategy 用户在表单中提交的新策略
   */
  async function handleSave(nextStrategy: ModelStrategyInput) {
    await saveBookStrategy(bookId, nextStrategy);
    setStrategy(nextStrategy);
    toast.success("书籍模型策略保存成功");
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载模型策略中...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <ModelStrategyForm
      initialStrategy={strategy}
      availableModels={availableModels}
      onSave={handleSave}
      showResetToRecommended
    />
  );
}
