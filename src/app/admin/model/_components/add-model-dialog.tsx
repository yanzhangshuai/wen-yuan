"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAdminModel, type AdminModelItem, type CreateModelPayload } from "@/lib/services/models";

interface AddModelDialogProps {
  open        : boolean;
  onOpenChange: (open: boolean) => void;
  onCreated   : (model: AdminModelItem) => void;
}

interface FormState {
  provider       : string;
  name           : string;
  providerModelId: string;
  baseUrl        : string;
  apiKey         : string;
}

const INITIAL_FORM: FormState = {
  provider       : "",
  name           : "",
  providerModelId: "",
  baseUrl        : "",
  apiKey         : ""
};

export function AddModelDialog({ open, onOpenChange, onCreated }: AddModelDialogProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  function updateField(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleClose() {
    setForm(INITIAL_FORM);
    setShowApiKey(false);
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!form.provider.trim()) {
      toast.error("供应商不能为空");
      return;
    }
    if (!form.name.trim()) {
      toast.error("名称不能为空");
      return;
    }
    if (!form.providerModelId.trim()) {
      toast.error("模型标识不能为空");
      return;
    }
    if (!form.baseUrl.trim()) {
      toast.error("Base URL 不能为空");
      return;
    }

    setSubmitting(true);

    const payload: CreateModelPayload = {
      provider       : form.provider.trim(),
      name           : form.name.trim(),
      providerModelId: form.providerModelId.trim(),
      baseUrl        : form.baseUrl.trim()
    };
    if (form.apiKey.trim()) {
      payload.apiKey = form.apiKey.trim();
    }

    try {
      const created = await createAdminModel(payload);
      onCreated(created);
      toast.success("模型创建成功");
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新增模型</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>
              供应商 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.provider}
              placeholder="例如 deepseek / openai / my-provider"
              onChange={e => updateField("provider", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>
              显示名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.name}
              placeholder="例如 DeepSeek V4"
              onChange={e => updateField("name", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>
              模型标识 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.providerModelId}
              placeholder="例如 deepseek-v4 / gpt-4o"
              onChange={e => updateField("providerModelId", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Base URL <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.baseUrl}
              placeholder="例如 https://api.deepseek.com"
              onChange={e => updateField("baseUrl", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>API Key（可选）</Label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={form.apiKey}
                placeholder="输入 API Key"
                onChange={e => updateField("apiKey", e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(prev => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
              >
                {showApiKey
                  ? <EyeOff className="h-4 w-4" />
                  : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
