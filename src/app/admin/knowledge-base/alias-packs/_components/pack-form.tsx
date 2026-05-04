"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  getKnowledgePackScopeLabel,
  KNOWLEDGE_PACK_SCOPE_OPTIONS
} from "@/lib/knowledge-presentation";
import { type BookTypeItem } from "@/lib/services/book-types";
import {
  createKnowledgePack,
  updateKnowledgePack,
  type KnowledgePackItem
} from "@/lib/services/knowledge";

const UNLINKED_BOOK_TYPE_VALUE = "__UNLINKED_BOOK_TYPE__";

export function PackForm({
  initial,
  bookTypes,
  redirectTo,
  onSuccess,
  onCancel
}: {
  initial   : KnowledgePackItem | null;
  bookTypes : BookTypeItem[];
  redirectTo: string;
  onSuccess?: () => void;
  onCancel? : () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName]               = useState(initial?.name ?? "");
  const [scope, setScope]             = useState(initial?.scope ?? "BOOK_TYPE");
  const [bookTypeId, setBookTypeId]   = useState<string>(initial?.bookTypeId ?? UNLINKED_BOOK_TYPE_VALUE);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isActive, setIsActive]       = useState(initial?.isActive ?? true);
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    setName(initial?.name ?? "");
    setScope(initial?.scope ?? "BOOK_TYPE");
    setBookTypeId(initial?.bookTypeId ?? UNLINKED_BOOK_TYPE_VALUE);
    setDescription(initial?.description ?? "");
    setIsActive(initial?.isActive ?? true);
  }, [initial]);

  async function handleSubmit() {
    setSaving(true);
    try {
      if (initial) {
        await updateKnowledgePack(initial.id, {
          name       : name.trim(),
          description: description.trim() ? description.trim() : null,
          isActive
        });
        toast({ title: "知识包已更新" });
      } else {
        await createKnowledgePack({
          name       : name.trim(),
          scope,
          bookTypeId : bookTypeId === UNLINKED_BOOK_TYPE_VALUE ? undefined : bookTypeId,
          description: description.trim() ? description.trim() : undefined
        });
        toast({ title: "知识包创建成功" });
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(redirectTo);
        router.refresh();
      }
    } catch (error) {
      toast({ title: initial ? "更新失败" : "创建失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {initial ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          范围：{getKnowledgePackScopeLabel(initial.scope)} · 关联题材：{initial.bookType?.name ?? "未关联"} · 当前版本：v{initial.version}
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label>名称</Label>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="如：三国演义核心人物知识库" />
      </div>

      {!initial ? (
        <>
          <div className="grid gap-2">
            <Label>范围</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KNOWLEDGE_PACK_SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">内部使用 BOOK_TYPE/BOOK 枚举，但前端统一显示中文说明。</div>
          </div>
          <div className="grid gap-2">
            <Label>关联书籍类型（可选）</Label>
            <Select value={bookTypeId} onValueChange={setBookTypeId}>
              <SelectTrigger><SelectValue placeholder="选择书籍类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNLINKED_BOOK_TYPE_VALUE}>不关联任何书籍类型</SelectItem>
                {bookTypes.map((bookType) => (
                  <SelectItem key={bookType.id} value={bookType.id}>{bookType.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}

      <div className="grid gap-2">
        <Label>描述</Label>
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
      </div>

      {initial ? (
        <div className="flex items-center gap-2 rounded-md border p-3">
          <Checkbox id="knowledge-pack-active" checked={isActive} onCheckedChange={(checked) => setIsActive(Boolean(checked))} />
          <Label htmlFor="knowledge-pack-active">启用知识包（停用后不参与运行时加载）</Label>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.push(redirectTo)}> 取消</Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !name.trim()}>
          {saving ? "保存中..." : initial ? "保存" : "创建"}
        </Button>
      </div>
    </div>
  );
}
