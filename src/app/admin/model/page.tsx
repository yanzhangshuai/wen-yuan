"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { readApiErrorMessage, readApiSuccessResponse } from "@/lib/api-client";

type RequestStatus = "idle" | "loading" | "success" | "error";

interface AdminModelItem {
  id          : string;
  provider    : string;
  name        : string;
  modelId     : string;
  baseUrl     : string;
  apiKeyMasked: string | null;
  isConfigured: boolean;
  isEnabled   : boolean;
  isDefault   : boolean;
  updatedAt   : string;
}

interface ModelDraftState {
  baseUrl    : string;
  apiKey     : string;
  clearApiKey: boolean;
  isEnabled  : boolean;
}

interface ModelActionState {
  saveStatus    : RequestStatus;
  saveMessage   : string | null;
  defaultStatus : RequestStatus;
  defaultMessage: string | null;
  testStatus    : RequestStatus;
  testMessage   : string | null;
  testLatencyMs : number | null;
}

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year  : "numeric",
  month : "2-digit",
  day   : "2-digit",
  hour  : "2-digit",
  minute: "2-digit"
});

function createDefaultActionState(): ModelActionState {
  return {
    saveStatus    : "idle",
    saveMessage   : null,
    defaultStatus : "idle",
    defaultMessage: null,
    testStatus    : "idle",
    testMessage   : null,
    testLatencyMs : null
  };
}

function buildInitialDraft(model: AdminModelItem): ModelDraftState {
  return {
    baseUrl    : model.baseUrl,
    apiKey     : "",
    clearApiKey: false,
    isEnabled  : model.isEnabled
  };
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeModel(input: unknown): AdminModelItem {
  if (typeof input !== "object" || input === null) {
    throw new Error("模型数据格式不正确");
  }

  const record = input as Record<string, unknown>;
  const id = readString(record.id, "");
  if (!id) {
    throw new Error("模型缺少 id");
  }

  const apiKeyMasked = readString(record.apiKeyMasked ?? null, "");
  const isConfigured = readBoolean(record.isConfigured, false);

  return {
    id,
    provider    : readString(record.provider, ""),
    name        : readString(record.name, ""),
    modelId     : readString(record.modelId, ""),
    baseUrl     : readString(record.baseUrl, ""),
    apiKeyMasked: apiKeyMasked || null,
    isConfigured,
    isEnabled   : readBoolean(record.isEnabled, false),
    isDefault   : readBoolean(record.isDefault, false),
    updatedAt   : readString(record.updatedAt, "")
  };
}

function formatUpdatedAt(value: string): string {
  if (!value) {
    return "未知";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return dateFormatter.format(parsedDate);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function resolveCanEnable(model: AdminModelItem, draft: ModelDraftState): boolean {
  if (draft.clearApiKey) {
    return false;
  }

  return model.isConfigured || draft.apiKey.trim().length > 0;
}

interface ModelTestResult {
  message  : string;
  latencyMs: number | null;
}

function normalizeModelList(input: unknown): AdminModelItem[] {
  if (!Array.isArray(input)) {
    throw new Error("模型列表格式不正确");
  }

  return input.map((item) => normalizeModel(item));
}

function normalizeModelTestResult(input: unknown): ModelTestResult {
  if (typeof input !== "object" || input === null) {
    throw new Error("连通性测试返回格式不正确");
  }

  const record = input as Record<string, unknown>;
  return {
    message  : readString(record.message, "连通性测试成功"),
    latencyMs: typeof record.latencyMs === "number" ? record.latencyMs : null
  };
}

async function requestJson<T>(
  input: RequestInfo,
  parser: (data: unknown) => T,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers
  });

  const payload: unknown = await response.json().catch((): unknown => null);

  if (!response.ok) {
    throw new Error(readApiErrorMessage(payload, `请求失败 (${response.status})`));
  }

  const successResponse = readApiSuccessResponse(payload);
  if (successResponse === null) {
    throw new Error("接口返回格式不正确");
  }

  return parser(successResponse.data);
}

export default function AdminModelPage() {
  const [models, setModels] = useState<AdminModelItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ModelDraftState>>({});
  const [actions, setActions] = useState<Record<string, ModelActionState>>({});
  const [pageStatus, setPageStatus] = useState<RequestStatus>("loading");
  const [pageMessage, setPageMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      setPageStatus("loading");
      setPageMessage(null);

      try {
        const nextModels = await requestJson(
          "/api/admin/models",
          (data) => normalizeModelList(data),
          { cache: "no-store" }
        );

        if (cancelled) {
          return;
        }

        setModels(nextModels);
        setDrafts(Object.fromEntries(nextModels.map((model) => [model.id, buildInitialDraft(model)])));
        setActions(Object.fromEntries(nextModels.map((model) => [model.id, createDefaultActionState()])));
        setPageStatus("success");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPageStatus("error");
        setPageMessage(getErrorMessage(error, "模型列表加载失败"));
      }
    }

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedModels = useMemo(() => {
    return [...models].sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
  }, [models]);

  function updateDraft(modelId: string, updater: (draft: ModelDraftState) => ModelDraftState) {
    setDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[modelId];
      if (!currentDraft) {
        return currentDrafts;
      }

      return {
        ...currentDrafts,
        [modelId]: updater(currentDraft)
      };
    });
  }

  function updateAction(modelId: string, updater: (action: ModelActionState) => ModelActionState) {
    setActions((currentActions) => ({
      ...currentActions,
      [modelId]: updater(currentActions[modelId] ?? createDefaultActionState())
    }));
  }

  function replaceModel(nextModel: AdminModelItem) {
    setModels((currentModels) => currentModels.map((model) => (model.id === nextModel.id ? nextModel : model)));
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [nextModel.id]: buildInitialDraft(nextModel)
    }));
  }

  async function handleSave(model: AdminModelItem) {
    const draft = drafts[model.id];
    if (!draft) {
      return;
    }

    if (draft.isEnabled && !resolveCanEnable(model, draft)) {
      updateAction(model.id, (currentAction) => ({
        ...currentAction,
        saveStatus : "error",
        saveMessage: "请先配置 API Key，再启用模型"
      }));
      return;
    }

    updateAction(model.id, (currentAction) => ({
      ...currentAction,
      saveStatus    : "loading",
      saveMessage   : "保存中...",
      defaultMessage: currentAction.defaultMessage,
      testMessage   : currentAction.testMessage
    }));

    const body: Record<string, unknown> = {
      baseUrl  : draft.baseUrl.trim(),
      isEnabled: draft.isEnabled
    };

    if (draft.clearApiKey) {
      body.apiKey = null;
    } else if (draft.apiKey.trim()) {
      body.apiKey = draft.apiKey.trim();
    }

    try {
      const normalizedModel = await requestJson(
        `/api/admin/models/${model.id}`,
        (data) => normalizeModel(data),
        {
          method: "PATCH",
          body  : JSON.stringify(body)
        }
      );

      replaceModel(normalizedModel);
      updateAction(model.id, (currentAction) => ({
        ...currentAction,
        saveStatus : "success",
        saveMessage: "保存成功"
      }));
    } catch (error) {
      updateAction(model.id, (currentAction) => ({
        ...currentAction,
        saveStatus : "error",
        saveMessage: getErrorMessage(error, "保存失败")
      }));
    }
  }

  async function handleSetDefault(modelId: string) {
    updateAction(modelId, (currentAction) => ({
      ...currentAction,
      defaultStatus : "loading",
      defaultMessage: "设置默认中..."
    }));

    try {
      const normalizedModel = await requestJson(
        `/api/admin/models/${modelId}/set-default`,
        (data) => normalizeModel(data),
        {
          method: "POST"
        }
      );

      setModels((currentModels) => currentModels.map((model) => ({
        ...model,
        isDefault: model.id === normalizedModel.id
      })));
      setDrafts((currentDrafts) => ({
        ...currentDrafts,
        [normalizedModel.id]: currentDrafts[normalizedModel.id] ?? buildInitialDraft(normalizedModel)
      }));
      updateAction(modelId, (currentAction) => ({
        ...currentAction,
        defaultStatus : "success",
        defaultMessage: "已设为默认模型"
      }));
    } catch (error) {
      updateAction(modelId, (currentAction) => ({
        ...currentAction,
        defaultStatus : "error",
        defaultMessage: getErrorMessage(error, "设置默认模型失败")
      }));
    }
  }

  async function handleTest(modelId: string) {
    updateAction(modelId, (currentAction) => ({
      ...currentAction,
      testStatus   : "loading",
      testMessage  : "测试中...",
      testLatencyMs: null
    }));

    try {
      const result = await requestJson(
        `/api/admin/models/${modelId}/test`,
        (data) => normalizeModelTestResult(data),
        {
          method: "POST"
        }
      );
      const latencyMs = result.latencyMs;
      const message = result.message;

      updateAction(modelId, (currentAction) => ({
        ...currentAction,
        testStatus   : "success",
        testMessage  : message,
        testLatencyMs: latencyMs
      }));
    } catch (error) {
      updateAction(modelId, (currentAction) => ({
        ...currentAction,
        testStatus   : "error",
        testMessage  : getErrorMessage(error, "连通性测试失败"),
        testLatencyMs: null
      }));
    }
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">模型设置</h1>
        <p className="text-sm text-slate-600">
          统一管理各 AI 模型的 Base URL、API Key、启用状态、默认模型与连通性测试。
        </p>
      </div>

      {pageStatus === "loading" ? (
        <Card>
          <CardContent className="py-8 text-sm text-slate-500">正在加载模型配置...</CardContent>
        </Card>
      ) : null}

      {pageStatus === "error" && pageMessage ? (
        <Alert variant="destructive">
          <AlertTitle>模型列表加载失败</AlertTitle>
          <AlertDescription>{pageMessage}</AlertDescription>
        </Alert>
      ) : null}

      {pageStatus === "success" && sortedModels.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-slate-500">当前没有可配置的模型。</CardContent>
        </Card>
      ) : null}

      {sortedModels.map((model) => {
        const draft = drafts[model.id] ?? buildInitialDraft(model);
        const action = actions[model.id] ?? createDefaultActionState();
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
                  disabled={model.isDefault || action.defaultStatus === "loading"}
                  onClick={() => void handleSetDefault(model.id)}
                >
                  {action.defaultStatus === "loading" ? "设置中..." : "设为默认"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.testStatus === "loading"}
                  onClick={() => void handleTest(model.id)}
                >
                  {action.testStatus === "loading" ? "测试中..." : "连通性测试"}
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
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      updateDraft(model.id, (currentDraft) => ({
                        ...currentDraft,
                        baseUrl: nextValue
                      }));
                    }}
                  />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-slate-800">API Key</span>
                  <Input
                    type="password"
                    value={draft.apiKey}
                    placeholder={model.isConfigured ? "留空表示保持当前 Key" : "输入新的 API Key"}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      updateDraft(model.id, (currentDraft) => ({
                        ...currentDraft,
                        apiKey     : nextValue,
                        clearApiKey: false
                      }));
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
                    onChange={(event) => {
                      const checked = event.target.checked;
                      updateDraft(model.id, (currentDraft) => ({
                        ...currentDraft,
                        isEnabled: checked
                      }));
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
                      updateDraft(model.id, (currentDraft) => ({
                        ...currentDraft,
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
                      setDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [model.id]: buildInitialDraft(model)
                      }));
                      updateAction(model.id, (currentAction) => ({
                        ...currentAction,
                        saveStatus : "idle",
                        saveMessage: null
                      }));
                    }}
                  >
                    重置
                  </Button>
                  <Button
                    size="sm"
                    disabled={action.saveStatus === "loading"}
                    onClick={() => void handleSave(model)}
                  >
                    {action.saveStatus === "loading" ? "保存中..." : "保存配置"}
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

              {action.saveMessage ? (
                <Alert variant={action.saveStatus === "success" ? "success" : action.saveStatus === "error" ? "destructive" : "default"}>
                  <AlertTitle>保存状态</AlertTitle>
                  <AlertDescription>{action.saveMessage}</AlertDescription>
                </Alert>
              ) : null}

              {action.defaultMessage ? (
                <Alert variant={action.defaultStatus === "success" ? "success" : action.defaultStatus === "error" ? "destructive" : "default"}>
                  <AlertTitle>默认模型</AlertTitle>
                  <AlertDescription>{action.defaultMessage}</AlertDescription>
                </Alert>
              ) : null}

              {action.testMessage ? (
                <Alert variant={action.testStatus === "success" ? "success" : action.testStatus === "error" ? "destructive" : "default"}>
                  <AlertTitle>连通性测试</AlertTitle>
                  <AlertDescription>
                    {action.testMessage}
                    {action.testLatencyMs !== null ? `，耗时 ${action.testLatencyMs} ms` : ""}
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
