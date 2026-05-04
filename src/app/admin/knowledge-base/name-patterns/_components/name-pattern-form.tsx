"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

import {
  NAME_PATTERN_ACTIONS,
  NAME_PATTERN_RULE_TYPES,
  createNamePattern,
  updateNamePattern,
  type NamePatternAction,
  type NamePatternRuleItem,
  type NamePatternRuleType
} from "@/lib/services/name-patterns";

interface NamePatternFormProps {
  initial?  : NamePatternRuleItem | null;
  onSuccess?: () => void;
  onCancel? : () => void;
}

/**
 * 名字模式规则新增 / 编辑共享表单。
 * 创建场景优先使用内联面板（提供 onSuccess/onCancel 回调），编辑还是路由页。
 */
export function NamePatternForm({ initial, onSuccess, onCancel }: NamePatternFormProps) {
  const router    = useRouter();
  const { toast } = useToast();

  const [ruleType,     setRuleType]     = useState<NamePatternRuleType>(initial?.ruleType ?? "FAMILY_HOUSE");
  const [pattern,      setPattern]      = useState(initial?.pattern ?? "");
  const [action,       setAction]       = useState<NamePatternAction>(initial?.action ?? "BLOCK");
  const [description,  setDescription]  = useState(initial?.description ?? "");
  const [isActive,     setIsActive]     = useState(initial?.isActive ?? true);
  const [saving,       setSaving]       = useState(false);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pattern.trim()) {
      toast({ title: "请填写正则模式", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await updateNamePattern(initial.id, {
          ruleType,
          pattern    : pattern.trim(),
          action,
          description: description.trim() || null,
          isActive
        });
        toast({ title: "更新成功" });
      } else {
        await createNamePattern({
          ruleType,
          pattern    : pattern.trim(),
          action,
          description: description.trim() || undefined,
          isActive
        });
        toast({ title: "创建成功" });
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/admin/knowledge-base/name-patterns");
        router.refresh();
      }
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="grid max-w-2xl gap-4">
      <div className="grid gap-2">
        <Label htmlFor="np-rule-type">规则类型 *</Label>
        <Select value={ruleType} onValueChange={(v) => setRuleType(v as NamePatternRuleType)} disabled={saving}>
          <SelectTrigger id="np-rule-type" aria-label="规则类型">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NAME_PATTERN_RULE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {NAME_PATTERN_RULE_TYPES.find((t) => t.value === ruleType)?.description}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="np-pattern">正则模式 *</Label>
        <Input
          id="np-pattern"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="如：.{1,3}(家|府|庄)$"
          className="font-mono text-sm"
          disabled={saving}
          required
        />
        <p className="text-xs text-muted-foreground">标准 Unicode 正则表达式，服务端会验证语法安全性。</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="np-action">动作 *</Label>
        <Select value={action} onValueChange={(v) => setAction(v as NamePatternAction)} disabled={saving}>
          <SelectTrigger id="np-action" aria-label="动作">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NAME_PATTERN_ACTIONS.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="np-description">说明</Label>
        <Textarea
          id="np-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="可选，说明此规则的适用场景"
          rows={2}
          disabled={saving}
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch id="np-active" checked={isActive} onCheckedChange={setIsActive} disabled={saving} />
        <Label htmlFor="np-active">启用</Label>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={saving || !pattern.trim()}>
          {saving ? "保存中…" : "保存"}
        </Button>
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.back()} disabled={saving}>
          取消
        </Button>
      </div>
    </form>
  );
}
