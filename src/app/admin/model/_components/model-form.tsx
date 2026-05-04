"use client";

/**
 * =============================================================================
 * 文件定位（Admin 模型表单 / 客户端组件）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/admin/model/_components/model-form.tsx`
 *
 * 组件角色：
 * - 模型「新建」与「编辑」共用的表单组件。
 * - 参考知识库 `RelationshipTypeForm` 的范式：通过 `initial` 是否为 `null`
 *   区分两种模式，统一字段、校验、提交与 dirty/loading 状态。
 *
 * 业务设计：
 * - `initial = null`：调用 `createModel`，可选设置 `isDefault`；
 * - `initial = AdminModelItem`：调用 `patchModel`，支持 `clearApiKey` 三态；
 * - 提交成功后优先回调 `onSuccess`，否则导航到 `redirectTo`，再否则保持原页。
 *
 * 边界约束：
 * - 不直接负责列表刷新；调用方通过 `onSuccess` 决定刷新策略；
 * - API Key 默认不回填（明文密钥不应回到前端）；编辑态下提供「清空已有密钥」开关。
 * =============================================================================
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  createModel,
  patchModel,
  type AdminModelItem,
  type CreateModelBody,
  type PatchModelBody
} from "@/lib/services/models";

type AiModelProtocol = AdminModelItem["protocol"];

interface FormState {
  provider         : string;
  protocol         : AiModelProtocol;
  name             : string;
  providerModelId  : string;
  aliasKey         : string;
  baseUrl          : string;
  /** 新输入的 API Key（不回填后端明文）。 */
  apiKey           : string;
  /** 编辑态下显式清空已配置的密钥。 */
  clearApiKey      : boolean;
  isEnabled        : boolean;
  /** 仅在新建态下生效。 */
  isDefault        : boolean;
  /** 能力声明：是否支持深度思考。 */
  supportsThinking : boolean;
  /** 能力声明：是否支持联网搜索。 */
  supportsWebSearch: boolean;
}

function buildInitialForm(initial: AdminModelItem | null): FormState {
  if (!initial) {
    /**
     * 新建默认值：
     * - 预填 DeepSeek 官方 OpenAI-compatible endpoint，仅作首次引导；
     * - 后续二次新建其它供应商时管理员需手动覆盖关键字段。
     */
    return {
      provider         : "DeepSeek",
      protocol         : "openai-compatible",
      name             : "DeepSeek V4",
      providerModelId  : "deepseek-chat-v4",
      aliasKey         : "deepseek-v4",
      baseUrl          : "https://api.deepseek.com",
      apiKey           : "",
      clearApiKey      : false,
      isEnabled        : false,
      isDefault        : false,
      supportsThinking : false,
      supportsWebSearch: false
    };
  }
  return {
    provider         : initial.provider,
    protocol         : initial.protocol,
    name             : initial.name,
    providerModelId  : initial.providerModelId,
    aliasKey         : initial.aliasKey ?? "",
    baseUrl          : initial.baseUrl,
    apiKey           : "",
    clearApiKey      : false,
    isEnabled        : initial.isEnabled,
    isDefault        : initial.isDefault,
    supportsThinking : initial.supportsThinking,
    supportsWebSearch: initial.supportsWebSearch
  };
}

export interface ModelFormProps {
  /** 编辑模式下传入原始模型；新建模式传 `null`。 */
  initial    : AdminModelItem | null;
  /** 提交成功后的回调，常用于刷新列表或关闭内嵌表单。 */
  onSuccess? : (model: AdminModelItem) => void;
  /** 取消按钮回调；不传时取消按钮使用 `router.back()` 兜底。 */
  onCancel?  : () => void;
  /** 提交成功后没有 `onSuccess` 时使用的兜底跳转地址。 */
  redirectTo?: string;
}

export function ModelForm({ initial, onSuccess, onCancel, redirectTo }: ModelFormProps) {
  const router = useRouter();
  const isEditMode = initial !== null;

  const initialForm = useMemo(() => buildInitialForm(initial), [initial]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  /**
   * dirty 判定：
   * - 新建态恒视为「有内容」，提交按钮始终可点；
   * - 编辑态对比快照，便于用户判断是否有未保存改动。
   */
  const isDirty = useMemo(() => {
    if (!isEditMode) return true;
    return JSON.stringify(form) !== JSON.stringify(initialForm);
  }, [form, initialForm, isEditMode]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }
    router.back();
  }

  function validate(): string | null {
    if (!form.provider.trim()) return "Provider 不能为空";
    if (!form.name.trim()) return "名称不能为空";
    if (!form.providerModelId.trim()) return "模型标识不能为空";
    if (!form.baseUrl.trim()) return "Base URL 不能为空";
    if (form.isEnabled) {
      if (isEditMode) {
        const initialConfigured = initial?.isConfigured ?? false;
        const willHaveKey = form.clearApiKey
          ? false
          : initialConfigured || form.apiKey.trim().length > 0;
        if (!willHaveKey) return "请先配置 API Key，再启用模型";
      } else if (!form.apiKey.trim()) {
        return "启用模型前请先配置 API Key";
      }
    }
    return null;
  }

  async function handleSubmit() {
    const errorMessage = validate();
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }
    setSubmitting(true);
    try {
      let saved: AdminModelItem;
      if (isEditMode && initial) {
        const body: PatchModelBody = {
          provider         : form.provider.trim(),
          protocol         : form.protocol,
          name             : form.name.trim(),
          aliasKey         : form.aliasKey.trim() ? form.aliasKey.trim() : null,
          providerModelId  : form.providerModelId.trim(),
          baseUrl          : form.baseUrl.trim(),
          isEnabled        : form.isEnabled,
          supportsThinking : form.supportsThinking,
          supportsWebSearch: form.supportsWebSearch
        };
        if (form.clearApiKey) body.apiKey = null;
        else if (form.apiKey.trim()) body.apiKey = form.apiKey.trim();
        saved = await patchModel(initial.id, body);
        toast.success("保存成功");
      } else {
        const body: CreateModelBody = {
          provider         : form.provider.trim(),
          protocol         : form.protocol,
          name             : form.name.trim(),
          modelId          : form.providerModelId.trim(),
          aliasKey         : form.aliasKey.trim() ? form.aliasKey.trim() : null,
          baseUrl          : form.baseUrl.trim(),
          isEnabled        : form.isEnabled,
          isDefault        : form.isDefault,
          supportsThinking : form.supportsThinking,
          supportsWebSearch: form.supportsWebSearch
        };
        if (form.apiKey.trim()) body.apiKey = form.apiKey.trim();
        saved = await createModel(body);
        toast.success("模型已添加");
      }
      if (onSuccess) {
        onSuccess(saved);
      } else if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isEditMode ? "保存失败" : "新增模型失败"));
    } finally {
      setSubmitting(false);
    }
  }

  const apiKeyPlaceholder = isEditMode && initial?.isConfigured
    ? (initial.apiKeyMasked ?? "已配置（留空则保持不变）")
    : "输入 API Key";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Input
            value={form.provider}
            onChange={(event) => update("provider", event.target.value)}
            placeholder="例如 DeepSeek / Qwen / Doubao"
          />
        </div>
        <div className="space-y-2">
          <Label>Protocol</Label>
          <Select
            value={form.protocol}
            onValueChange={(value: AiModelProtocol) => update("protocol", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai-compatible">openai-compatible</SelectItem>
              <SelectItem value="gemini">gemini</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>名称</Label>
          <Input
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="管理端展示名"
          />
        </div>
        <div className="space-y-2">
          <Label>Alias Key</Label>
          <Input
            value={form.aliasKey}
            onChange={(event) => update("aliasKey", event.target.value)}
            placeholder="供策略/推荐引用，可选"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>模型标识</Label>
          <Input
            value={form.providerModelId}
            onChange={(event) => update("providerModelId", event.target.value)}
            placeholder="例如 deepseek-chat / qwen-plus / ep-xxxx"
          />
          {form.provider.trim().toLowerCase() === "doubao" && (
            <p className="text-xs text-amber-600">
              豆包请填写方舟控制台中的 Endpoint/模型标识（通常不是 doubao-pro）。
            </p>
          )}
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Base URL</Label>
          <Input
            value={form.baseUrl}
            onChange={(event) => update("baseUrl", event.target.value)}
            placeholder="https://api.example.com"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>API Key</Label>
          <div className="relative">
            <Input
              type={showApiKey ? "text" : "password"}
              value={form.apiKey}
              placeholder={apiKeyPlaceholder}
              disabled={form.clearApiKey}
              onChange={(event) => update("apiKey", event.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowApiKey((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {isEditMode && initial?.isConfigured && (
            <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={form.clearApiKey}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setForm((current) => ({
                    ...current,
                    clearApiKey: checked,
                    apiKey     : checked ? "" : current.apiKey,
                    isEnabled  : checked ? false : current.isEnabled
                  }));
                }}
              />
              清空已保存的 API Key（清空后将自动停用此模型）
            </label>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="cursor-pointer">启用</Label>
            <p className="text-xs text-muted-foreground">启用后模型可被解析任务选用</p>
          </div>
          <Switch
            checked={form.isEnabled}
            onCheckedChange={(checked) => update("isEnabled", checked)}
          />
        </div>
        {!isEditMode && (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="cursor-pointer">设为默认</Label>
              <p className="text-xs text-muted-foreground">新书籍导入时使用此模型</p>
            </div>
            <Switch
              checked={form.isDefault}
              onCheckedChange={(checked) => update("isDefault", checked)}
            />
          </div>
        )}
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="cursor-pointer">支持深度思考</Label>
            <p className="text-xs text-muted-foreground">勾选后阶段策略可针对此模型启用 thinking</p>
          </div>
          <Switch
            checked={form.supportsThinking}
            onCheckedChange={(checked) => update("supportsThinking", checked)}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="cursor-pointer">支持联网搜索</Label>
            <p className="text-xs text-muted-foreground">勾选后阶段策略可针对此模型启用 web search</p>
          </div>
          <Switch
            checked={form.supportsWebSearch}
            onCheckedChange={(checked) => update("supportsWebSearch", checked)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <div className="text-xs text-muted-foreground">
          {isEditMode
            ? (isDirty ? "● 你有未保存的改动" : "已是最新")
            : "填写完成后点击「添加模型」"}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={submitting}>
            取消
          </Button>
          <Button
            type="button"
            disabled={submitting || (isEditMode && !isDirty)}
            onClick={() => void handleSubmit()}
          >
            {submitting
              ? (isEditMode ? "保存中..." : "添加中...")
              : (isEditMode ? "保存修改" : "添加模型")}
          </Button>
        </div>
      </div>
    </div>
  );
}
