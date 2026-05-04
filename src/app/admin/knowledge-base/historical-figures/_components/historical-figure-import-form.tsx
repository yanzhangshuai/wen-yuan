"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  importHistoricalFigures,
  type HistoricalFigureCategory
} from "@/lib/services/historical-figures";

/**
 * 批量导入表单（路由级整页）。
 * 替代原 `<Dialog>` 弹窗形式。
 */
export function HistoricalFigureImportForm() {
  const router    = useRouter();
  const { toast } = useToast();
  const [text,    setText]    = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lines = text.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return;

    const defaultCategory: HistoricalFigureCategory = "SAGE";
    const entries = lines.map((line) => {
      const parts = line.split(/\t|,|，/);
      return {
        name    : (parts[0] ?? "").trim(),
        category: defaultCategory,
        aliases : parts.slice(1).map((s) => s.trim()).filter(Boolean)
      };
    }).filter((e) => e.name);

    if (entries.length === 0) {
      toast({ title: "无有效数据", variant: "destructive" });
      return;
    }

    setPending(true);
    try {
      const result = await importHistoricalFigures(entries);
      toast({
        title      : "导入完成",
        description: `共 ${result.total} 条，成功导入 ${result.imported} 条。`
      });
      router.push("/admin/knowledge-base/historical-figures");
      router.refresh();
    } catch (error) {
      toast({ title: "导入失败", description: String(error), variant: "destructive" });
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid max-w-2xl gap-4">
      <p className="text-sm text-muted-foreground">
        每行一条，格式：名称（TAB 或逗号分隔可附别名）。类别默认为&ldquo;圣贤&rdquo;，导入后可逐条编辑调整。
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"孔子\t仲尼、至圣先师\n老子\t李耳、太上老君\n庄子"}
        rows={12}
        className="font-mono text-sm"
        disabled={pending}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || !text.trim()}>
          {pending ? "导入中…" : "确认导入"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          取消
        </Button>
      </div>
    </form>
  );
}
