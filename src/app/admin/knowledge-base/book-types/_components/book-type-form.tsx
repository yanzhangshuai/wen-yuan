"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

import {
  type BookTypeItem,
  createBookType,
  updateBookType
} from "@/lib/services/book-types";

interface BookTypeFormProps {
  initial?  : BookTypeItem | null;
  onSuccess?: () => void;
  onCancel? : () => void;
}

/**
 * 书籍类型新增 / 编辑共享表单。
 *
 * 设计要点：
 * - 路由级整页表单：替代原有 `<Dialog>` 弹窗。
 * - 新增 (`initial == null`) 与编辑 (`initial != null`) 复用同一份字段定义。
 * - 保存成功后跳回列表页 `/admin/knowledge-base/book-types`。
 */
export function BookTypeForm({ initial, onSuccess, onCancel }: BookTypeFormProps) {
  const router       = useRouter();
  const { toast }    = useToast();
  const isEdit       = Boolean(initial);

  const [key,             setKey]             = useState(initial?.key ?? "");
  const [name,            setName]            = useState(initial?.name ?? "");
  const [description,     setDescription]     = useState(initial?.description ?? "");
  const [presetConfigStr, setPresetConfigStr] = useState(
    initial?.presetConfig ? JSON.stringify(initial.presetConfig, null, 2) : "{}"
  );
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [isActive,  setIsActive]  = useState(initial?.isActive ?? true);
  const [saving,    setSaving]    = useState(false);

  // 编辑模式下，若父组件后续重新拉取 initial（边界场景），同步本地状态
  useEffect(() => {
    if (initial) {
      setKey(initial.key);
      setName(initial.name);
      setDescription(initial.description ?? "");
      setPresetConfigStr(initial.presetConfig ? JSON.stringify(initial.presetConfig, null, 2) : "{}");
      setSortOrder(initial.sortOrder);
      setIsActive(initial.isActive);
    }
  }, [initial]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let presetConfig: Record<string, unknown> | undefined;
    if (presetConfigStr.trim()) {
      try {
        const parsed = JSON.parse(presetConfigStr) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          presetConfig = parsed as Record<string, unknown>;
        } else {
          toast({ title: "NER 配置必须是 JSON 对象", variant: "destructive" });
          return;
        }
      } catch {
        toast({ title: "NER 配置不是合法 JSON", variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      if (initial) {
        await updateBookType(initial.id, {
          name,
          description : description || null,
          presetConfig: presetConfig ?? null,
          sortOrder,
          isActive
        });
        toast({ title: "更新成功" });
      } else {
        await createBookType({
          key,
          name,
          description: description || undefined,
          presetConfig,
          sortOrder
        });
        toast({ title: "创建成功" });
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/admin/knowledge-base/book-types");
        router.refresh();
      }
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid max-w-2xl gap-4">
      <div className="grid gap-2">
        <Label htmlFor="bt-key">Key（唯一标识）</Label>
        <Input
          id="bt-key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="如：历史演义"
          disabled={isEdit}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bt-name">名称</Label>
        <Input
          id="bt-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：历史演义小说"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bt-desc">描述</Label>
        <Textarea
          id="bt-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bt-preset">NER 调谐配置（JSON）</Label>
        <Textarea
          id="bt-preset"
          value={presetConfigStr}
          onChange={(e) => setPresetConfigStr(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder='{"exemptGenericTitles": [], "additionalTitlePatterns": []}'
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="bt-sort">排序</Label>
          <Input
            id="bt-sort"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>启用</Label>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={!key || !name || saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.back()} disabled={saving}>
          取消
        </Button>
      </div>
    </form>
  );
}
