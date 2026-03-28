"use client";

import { use, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  patchModel,
  setDefaultModel,
  testModel,
  type AdminModelItem
} from "@/lib/services/models";

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
   Helpers
   ------------------------------------------------ */
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year  : "numeric",
  month : "2-digit",
  day   : "2-digit",
  hour  : "2-digit",
  minute: "2-digit"
});

function buildInitialDraft(model: AdminModelItem): ModelDraftState {
  return {
    baseUrl    : model.baseUrl,
    apiKey     : "",
    clearApiKey: false,
    isEnabled  : model.isEnabled
  };
}

function formatUpdatedAt(value: string): string {
  if (!value) return "未知";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value;
  return dateFormatter.format(parsedDate);
}

function resolveCanEnable(model: AdminModelItem, draft: ModelDraftState): boolean {
  if (draft.clearApiKey) return false;
  return model.isConfigured || draft.apiKey.trim().length > 0;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function ModelManager({
  initialModelsPromise
}: {
  initialModelsPromise: Promise<AdminModelItem[]>
}) {
  // 由 Server Component 传入已在服务端发起的 Promise，避免 SSR 时使用相对路径 fetch
  const initialModels = use(initialModelsPromise);

  const [models, setModels] = useState<AdminModelItem[]>(initialModels);
  const [drafts, setDrafts] = useState<Record<string, ModelDraftState>>(
    () => Object.fromEntries(initialModels.map(m => [m.id, buildInitialDraft(m)]))
  );
  // 每个模型的当前 loading action（save/default/test/null）
  const [loadingActions, setLoadingActions] = useState<Record<string, LoadingAction>>(
    () => Object.fromEntries(initialModels.map(m => [m.id, null]))
  );

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
      setDrafts(currentDrafts => ({
        ...currentDrafts,
        [updatedModel.id]: currentDrafts[updatedModel.id] ?? buildInitialDraft(updatedModel)
      }));
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
        <CardContent className="py-8 text-sm text-slate-500">当前没有可配置的模型。</CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">模型设置</h1>
        <p className="text-sm text-slate-600">
          统一管理各 AI 模型的 Base URL、API Key、启用状态、默认模型与连通性测试。
        </p>
      </div>

      {sortedModels.map(model => {
        const draft = drafts[model.id] ?? buildInitialDraft(model);
        const loadingAction = loadingActions[model.id] ?? null;
        const canEnable = resolveCanEnable(model, draft);

        return (
          <Card key={model.id}>
            <CardHeader className="gap-4 md:flex md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{model.name}</CardTitle>
                  <Badge variant="outline">{model.provider}</Badge>
                  {model.isDefault ? <Badge variant="success">默认模型</Badge> : null}
                  {model.isConfigured ? <Badge variant="success">已配置 Key</Badge> : <Badge variant="warning">未配置 Key</Badge>}
                  {model.isEnabled ? <Badge>已启用</Badge> : <Badge variant="outline">未启用</Badge>}
                </div>
                <CardDescription>
                  {model.modelId} · 最近更新 {formatUpdatedAt(model.updatedAt)}
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={model.isDefault ? "secondary" : "outline"}
                  disabled={model.isDefault || loadingAction === "default"}
                  onClick={() => void handleSetDefault(model.id)}
                >
                  {loadingAction === "default" ? "设置中..." : "设为默认"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loadingAction === "test"}
                  onClick={() => void handleTest(model.id)}
                >
                  {loadingAction === "test" ? "测试中..." : "连通性测试"}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Model ID</dt>
                  <dd className="mt-1 break-all font-medium text-slate-900">{model.modelId}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Base URL</dt>
                  <dd className="mt-1 break-all font-medium text-slate-900">{model.baseUrl}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">API Key</dt>
                  <dd className="mt-1 font-medium text-slate-900">{model.apiKeyMasked ?? "未配置"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">状态</dt>
                  <dd className="mt-1 font-medium text-slate-900">{model.isEnabled ? "已启用" : "未启用"}</dd>
                </div>
              </dl>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="font-medium text-slate-800">Base URL</span>
                  <Input
                    value={draft.baseUrl}
                    placeholder="https://api.example.com/v1"
                    onChange={event => {
                      const nextValue = event.target.value;
                      updateDraft(model.id, d => ({ ...d, baseUrl: nextValue }));
                    }}
                  />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-slate-800">API Key</span>
                  <Input
                    type="password"
                    value={draft.apiKey}
                    placeholder={model.isConfigured ? "留空表示保持当前 Key" : "输入新的 API Key"}
                    onChange={event => {
                      const nextValue = event.target.value;
                      updateDraft(model.id, d => ({ ...d, apiKey: nextValue, clearApiKey: false }));
                    }}
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={draft.isEnabled}
                    disabled={!canEnable}
                    onChange={event => {
                      const checked = event.target.checked;
                      updateDraft(model.id, d => ({ ...d, isEnabled: checked }));
                    }}
                  />
                  <span>
                    启用模型
                    {!canEnable ? "（请先配置 API Key）" : ""}
                  </span>
                </label>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      updateDraft(model.id, d => ({
                        ...d,
                        apiKey     : "",
                        clearApiKey: true,
                        isEnabled  : false
                      }));
                    }}
                  >
                    清除已存 Key
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDrafts(d => ({ ...d, [model.id]: buildInitialDraft(model) }));
                    }}
                  >
                    重置
                  </Button>
                  <Button
                    size="sm"
                    disabled={loadingAction === "save"}
                    onClick={() => void handleSave(model)}
                  >
                    {loadingAction === "save" ? "保存中..." : "保存配置"}
                  </Button>
                </div>
              </div>

              {draft.clearApiKey ? (
                <Alert>
                  <AlertTitle>将清除当前 API Key</AlertTitle>
                  <AlertDescription>
                    保存后该模型会失去已存凭证，并自动保持未启用状态。
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
