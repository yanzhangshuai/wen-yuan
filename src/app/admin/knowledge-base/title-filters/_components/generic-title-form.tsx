"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  GENERIC_TITLE_TIER_OPTIONS,
  getGenericTitleTierDescription
} from "@/lib/knowledge-presentation";
import {
  createGenericTitle,
  updateGenericTitle,
  type GenericTitleItem
} from "@/lib/services/title-filters";

type Tier = "SAFETY" | "DEFAULT" | "RELATIONAL";

export function GenericTitleForm({
  initial,
  redirectTo,
  onSuccess,
  onCancel
}: {
  initial   : GenericTitleItem | null;
  redirectTo: string;
  onSuccess?: () => void;
  onCancel? : () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle]                   = useState(initial?.title ?? "");
  const [tier, setTier]                     = useState<Tier>(initial?.tier ?? "DEFAULT");
  const [exemptInGenres, setExemptInGenres] = useState(initial?.exemptInGenres?.join(",") ?? "");
  const [description, setDescription]       = useState(initial?.description ?? "");
  const [isActive, setIsActive]             = useState(initial?.isActive ?? true);
  const [saving, setSaving]                 = useState(false);

  useEffect(() => {
    setTitle(initial?.title ?? "");
    setTier(initial?.tier ?? "DEFAULT");
    setExemptInGenres(initial?.exemptInGenres?.join(",") ?? "");
    setDescription(initial?.description ?? "");
    setIsActive(initial?.isActive ?? true);
  }, [initial]);

  async function handleSubmit() {
    const genres = exemptInGenres
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      if (initial) {
        await updateGenericTitle(initial.id, {
          tier,
          exemptInGenres: genres.length > 0 ? genres : null,
          description   : description || undefined,
          isActive
        });
      } else {
        await createGenericTitle({
          title,
          tier,
          exemptInGenres: genres.length > 0 ? genres : undefined,
          description   : description || undefined
        });
      }
      toast({ title: initial ? "更新成功" : "创建成功" });
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(redirectTo);
        router.refresh();
      }
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>称谓</Label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!!initial} />
        </div>
        <div className="grid gap-2">
          <Label>层级</Label>
          <Select value={tier} onValueChange={(value) => setTier(value as Tier)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GENERIC_TITLE_TIER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">当前层级说明：{getGenericTitleTierDescription(tier)}</div>
        </div>
        <div className="grid gap-2">
          <Label>书籍类型豁免</Label>
          <Input value={exemptInGenres} onChange={(event) => setExemptInGenres(event.target.value)} placeholder="用逗号分隔，例如：武侠,历史演义" />
        </div>
        <div className="grid gap-2">
          <Label>说明</Label>
          <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        {initial ? (
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>启用</Label>
          </div>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.push(redirectTo)}>取消</Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !title.trim()}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}
