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
  HISTORICAL_FIGURE_CATEGORIES,
  createHistoricalFigure,
  updateHistoricalFigure,
  type HistoricalFigureCategory,
  type HistoricalFigureItem
} from "@/lib/services/historical-figures";

interface HistoricalFigureFormProps {
  initial?  : HistoricalFigureItem | null;
  onSuccess?: () => void;
  onCancel? : () => void;
}

export function HistoricalFigureForm({ initial, onSuccess, onCancel }: HistoricalFigureFormProps) {
  const router    = useRouter();
  const { toast } = useToast();

  const [name,        setName]        = useState(initial?.name ?? "");
  const [aliasesText, setAliasesText] = useState(initial?.aliases.join("、") ?? "");
  const [dynasty,     setDynasty]     = useState(initial?.dynasty ?? "");
  const [category,    setCategory]    = useState<HistoricalFigureCategory>(initial?.category ?? "SAGE");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isActive,    setIsActive]    = useState(initial?.isActive ?? true);
  const [saving,      setSaving]      = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      toast({ title: "请填写名称", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const aliases = aliasesText
        .split(/[,，、\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (initial) {
        await updateHistoricalFigure(initial.id, {
          name       : name.trim(),
          aliases,
          dynasty    : dynasty.trim() || null,
          category,
          description: description.trim() || null,
          isActive
        });
        toast({ title: "更新成功" });
      } else {
        await createHistoricalFigure({
          name       : name.trim(),
          aliases,
          dynasty    : dynasty.trim() || undefined,
          category,
          description: description.trim() || undefined,
          isActive
        });
        toast({ title: "创建成功" });
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/admin/knowledge-base/historical-figures");
        router.refresh();
      }
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid max-w-2xl gap-4">
      <div className="grid gap-2">
        <Label htmlFor="hf-name">名称 *</Label>
        <Input
          id="hf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：孔子"
          disabled={saving}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="hf-aliases">别名（逗号/顿号分隔）</Label>
        <Input
          id="hf-aliases"
          value={aliasesText}
          onChange={(e) => setAliasesText(e.target.value)}
          placeholder="如：仲尼、至圣先师"
          disabled={saving}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="hf-dynasty">朝代</Label>
          <Input
            id="hf-dynasty"
            value={dynasty}
            onChange={(e) => setDynasty(e.target.value)}
            placeholder="如：春秋"
            disabled={saving}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="hf-category">类别 *</Label>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as HistoricalFigureCategory)}
            disabled={saving}
          >
            <SelectTrigger id="hf-category" aria-label="类别">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HISTORICAL_FIGURE_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="hf-description">说明</Label>
        <Textarea
          id="hf-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="可选，简短描述用于辅助 AI 判断"
          rows={2}
          disabled={saving}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="hf-active" checked={isActive} onCheckedChange={setIsActive} disabled={saving} />
        <Label htmlFor="hf-active">启用</Label>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? "保存中…" : "保存"}
        </Button>
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.back()} disabled={saving}>
          取消
        </Button>
      </div>
    </form>
  );
}
