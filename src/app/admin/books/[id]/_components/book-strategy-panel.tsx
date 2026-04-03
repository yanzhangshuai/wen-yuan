"use client";

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

interface BookStrategyPanelProps {
  bookId: string;
}

export function BookStrategyPanel({ bookId }: BookStrategyPanelProps) {
  const [strategy, setStrategy] = useState<ModelStrategyInput | null>(null);
  const [availableModels, setAvailableModels] = useState<EnabledModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        setAvailableModels(
          allModels
            .filter((model) => model.isEnabled)
            .map((model) => ({
              id      : model.id,
              name    : model.name,
              provider: model.provider,
              modelId : model.modelId
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
