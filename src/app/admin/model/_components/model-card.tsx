"use client";

/**
 * 文件定位（Admin 模型卡片 / 客户端组件）：
 * - 文件路径：`src/app/admin/model/_components/model-card.tsx`
 *
 * 设计动机：
 * - 用户希望「卡片像旧版那样把每个字段都呈现为输入框」，但默认禁用；
 * - 点击「编辑」后所有字段变为可输入，附带「保存 / 取消」；
 * - 这样既保留了字段可见性，又让保存语义清晰、避免与 Modal 冲突。
 *
 * 边界约束：
 * - 卡片内置自身的 draft 状态，编辑结束后由父组件接管列表刷新；
 * - 默认状态下不可点击「测试连接 / 设为默认 / 删除」之外的任何输入；
 * - API Key 编辑态下显示已掩码值作为 placeholder，留空提交则保持不变。
 */

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Cpu,
  DollarSign,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Trash2,
  Zap
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { patchModel, type AdminModelItem, type PatchModelBody } from "@/lib/services/models";

/* ---------------- Types ---------------- */
type AiModelProtocol = AdminModelItem["protocol"];
type LoadingAction = "default" | "test" | "toggle" | null;

interface DraftState {
  provider         : string;
  protocol         : AiModelProtocol;
  name             : string;
  providerModelId  : string;
  baseUrl          : string;
  /** 编辑态下新输入的 API Key；空串表示保持原值。 */
  apiKey           : string;
  /** 编辑态下显式清空已配置的密钥。 */
  clearApiKey      : boolean;
  /** 能力声明：深度思考。 */
  supportsThinking : boolean;
  /** 能力声明：联网搜索。 */
  supportsWebSearch: boolean;
}

function buildDraft(model: AdminModelItem): DraftState {
  return {
    provider         : model.provider,
    protocol         : model.protocol,
    name             : model.name,
    providerModelId  : model.providerModelId,
    baseUrl          : model.baseUrl,
    apiKey           : "",
    clearApiKey      : false,
    supportsThinking : model.supportsThinking,
    supportsWebSearch: model.supportsWebSearch
  };
}

/* ---------------- Helpers ---------------- */
function formatSuccessRate(successRate: number | null): string {
  if (successRate === null) return "暂无";
  return `${Math.round(successRate * 100)}%`;
}

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

/* ---------------- Props ---------------- */
export interface ModelCardProps {
  model          : AdminModelItem;
  editing        : boolean;
  loadingAction  : LoadingAction;
  isDeleting     : boolean;
  onEditStart    : () => void;
  onEditCancel   : () => void;
  onSaved        : (next: AdminModelItem) => void;
  onTest         : () => void;
  onSetDefault   : () => void;
  onToggleEnabled: (next: boolean) => void;
  onDelete       : () => void;
}

/* ---------------- Component ---------------- */
export function ModelCard({
  model,
  editing,
  loadingAction,
  isDeleting,
  onEditStart,
  onEditCancel,
  onSaved,
  onTest,
  onSetDefault,
  onToggleEnabled,
  onDelete
}: ModelCardProps) {
  const initialDraft = useMemo(() => buildDraft(model), [model]);
  const [draft, setDraft] = useState<DraftState>(initialDraft);
  const [showApiKey, setShowApiKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* 进入/退出编辑时同步快照。 */
  useEffect(() => {
    if (!editing) {
      setDraft(buildDraft(model));
      setShowApiKey(false);
    }
  }, [editing, model]);

  function update<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const apiKeyPlaceholder = model.isConfigured
    ? (model.apiKeyMasked ?? "已配置（留空保持不变）")
    : "未配置";

  const isDirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(initialDraft);
  }, [draft, initialDraft]);

  async function handleSave() {
    if (!draft.provider.trim()) return toast.error("Provider 不能为空");
    if (!draft.name.trim()) return toast.error("名称不能为空");
    if (!draft.providerModelId.trim()) return toast.error("模型标识不能为空");
    if (!draft.baseUrl.trim()) return toast.error("Base URL 不能为空");

    const body: PatchModelBody = {
      provider         : draft.provider.trim(),
      protocol         : draft.protocol,
      name             : draft.name.trim(),
      providerModelId  : draft.providerModelId.trim(),
      baseUrl          : draft.baseUrl.trim(),
      supportsThinking : draft.supportsThinking,
      supportsWebSearch: draft.supportsWebSearch
    };
    if (draft.clearApiKey) body.apiKey = null;
    else if (draft.apiKey.trim()) body.apiKey = draft.apiKey.trim();

    setSubmitting(true);
    try {
      const updated = await patchModel(model.id, body);
      toast.success("保存成功");
      onSaved(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  /* 业务约束：未配置 Key 时禁止启用开关。 */
  const switchDisabled = loadingAction === "toggle"
    || (!model.isConfigured && !model.isEnabled)
    || editing;

  const ratings = model.performance.ratings;
  const inputDisabled = !editing || submitting;

  return (
    <Card className={cn("relative", !model.isEnabled && !editing && "opacity-70", editing && "ring-1 ring-primary/40")}>
      {model.isDefault && (
        <Badge className="absolute -top-2 -right-2 z-10">默认</Badge>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Cpu className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <Input
                value={draft.name}
                disabled={inputDisabled}
                onChange={(event) => update("name", event.target.value)}
                placeholder="管理端展示名"
                className="h-8 text-base font-semibold"
              />
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={draft.protocol}
                  disabled={inputDisabled}
                  onValueChange={(value: AiModelProtocol) => update("protocol", value)}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai-compatible">openai-compatible</SelectItem>
                    <SelectItem value="gemini">gemini</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={draft.providerModelId}
                  disabled={inputDisabled}
                  onChange={(event) => update("providerModelId", event.target.value)}
                  placeholder="模型标识"
                  className="h-7 text-xs font-mono"
                />
              </div>
            </div>
          </div>
          <Switch
            checked={model.isEnabled}
            disabled={switchDisabled}
            onCheckedChange={onToggleEnabled}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 评分条 */}
        <div className="grid grid-cols-3 gap-4 text-xs">
          <RatingBar value={ratings.speed} icon={Zap} label="速度" />
          <RatingBar value={ratings.stability} icon={Check} label="稳定" />
          <RatingBar value={ratings.cost} icon={DollarSign} label="费用" variant="destructive" />
        </div>
        <p className="text-xs text-muted-foreground">
          样本 {model.performance.callCount} 次 · 成功率 {formatSuccessRate(model.performance.successRate)}
        </p>

        <Separator />

        {/* 字段输入区（默认禁用，编辑态可输入） */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Provider</Label>
            <Input
              value={draft.provider}
              disabled={inputDisabled}
              onChange={(event) => update("provider", event.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Base URL</Label>
            <Input
              value={draft.baseUrl}
              disabled={inputDisabled}
              onChange={(event) => update("baseUrl", event.target.value)}
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center justify-between">
              <span>API Key</span>
              {!editing && model.isConfigured && (
                <span className="inline-flex items-center gap-1 text-primary normal-case">
                  <Check className="h-3 w-3" />
                  已配置
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={draft.apiKey}
                placeholder={apiKeyPlaceholder}
                disabled={inputDisabled || draft.clearApiKey}
                onChange={(event) => update("apiKey", event.target.value)}
                className="h-8 pr-9 font-mono text-xs"
              />
              {editing && (
                <button
                  type="button"
                  onClick={() => setShowApiKey((current) => !current)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                >
                  {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
            {editing && model.isConfigured && (
              <label className="flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={draft.clearApiKey}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setDraft((current) => ({
                      ...current,
                      clearApiKey: checked,
                      apiKey     : checked ? "" : current.apiKey
                    }));
                  }}
                />
                清空已保存的 API Key
              </label>
            )}
          </div>

          {/* 能力声明：面向阶段策略门禁 */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="flex items-center justify-between rounded-md border px-2.5 py-1.5">
              <div className="flex flex-col">
                <span className="text-xs font-medium">深度思考</span>
                <span className="text-[10px] text-muted-foreground">thinking / reasoning</span>
              </div>
              <Switch
                checked={draft.supportsThinking}
                disabled={inputDisabled}
                onCheckedChange={(checked) => update("supportsThinking", checked)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-2.5 py-1.5">
              <div className="flex flex-col">
                <span className="text-xs font-medium">联网搜索</span>
                <span className="text-[10px] text-muted-foreground">web search</span>
              </div>
              <Switch
                checked={draft.supportsWebSearch}
                disabled={inputDisabled}
                onCheckedChange={(checked) => update("supportsWebSearch", checked)}
              />
            </div>
          </div>
        </div>

        {/* 操作区 */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {editing ? (
            <>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={submitting || !isDirty}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      保存中
                    </>
                  ) : (
                    "保存"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onEditCancel}
                  disabled={submitting}
                >
                  取消
                </Button>
              </div>
              {isDirty && (
                <span className="text-xs text-muted-foreground">未保存</span>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onTest}
                  disabled={loadingAction !== null || !model.isConfigured}
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
                {!model.isDefault && model.isEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSetDefault}
                    disabled={loadingAction !== null}
                  >
                    {loadingAction === "default" ? "设置中..." : "设为默认"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditStart}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  编辑
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                disabled={isDeleting || model.isDefault}
                aria-label={`删除模型 ${model.name}`}
                title={model.isDefault ? "默认模型不可删除" : "删除模型"}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
