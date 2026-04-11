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
import { useAdminModels } from "@/hooks/use-admin-models";
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

  /** 首屏策略加载状态。 */
  const [strategyLoading, setStrategyLoading] = useState(true);

  /** 首屏策略加载错误。 */
  const [error, setError] = useState<string | null>(null);

  // 统一 Store：模块级缓存，模型列表不重复拉取
  const { models, loading: modelsLoading, error: modelsError } = useAdminModels({ onlyEnabled: true });

  // 可用模型映射为表单所需格式
  const availableModels: EnabledModelItem[] = models.map((model) => ({
    id             : model.id,
    name           : model.name,
    provider       : model.provider,
    providerModelId: model.providerModelId,
    aliasKey       : model.aliasKey
  }));

  // 书籍策略单独加载（与模型列表解耦）
  useEffect(() => {
    let cancelled = false;

    async function loadStrategy() {
      setStrategyLoading(true);
      setError(null);

      try {
        const bookStrategy = await fetchBookStrategy(bookId);
        if (!cancelled) {
          setStrategy(bookStrategy);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "模型策略加载失败");
        }
      } finally {
        if (!cancelled) {
          setStrategyLoading(false);
        }
      }
    }

    void loadStrategy();

    return () => { cancelled = true; };
  }, [bookId]);

  async function handleSave(nextStrategy: ModelStrategyInput) {
    await saveBookStrategy(bookId, nextStrategy);
    setStrategy(nextStrategy);
    toast.success("书籍模型策略保存成功");
  }

  const loading = strategyLoading || modelsLoading;
  const combinedError = error ?? modelsError;

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

  if (combinedError) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">
          {combinedError}
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
