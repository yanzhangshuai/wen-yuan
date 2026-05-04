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
  createPromptExtractionRule,
  updatePromptExtractionRule,
  type PromptExtractionRuleItem,
  type PromptRuleType
} from "@/lib/services/prompt-extraction-rules";
import { type BookTypeItem } from "@/lib/services/book-types";

const GLOBAL_BOOK_TYPE_VALUE = "__GLOBAL_BOOK_TYPE__";

const RULE_TYPE_OPTIONS: Array<{ value: PromptRuleType; label: string }> = [
  { value: "ENTITY",       label: "实体规则" },
  { value: "RELATIONSHIP", label: "关系规则" }
];

function parsePromptRuleType(value: string): PromptRuleType {
  return RULE_TYPE_OPTIONS.find((option) => option.value === value)?.value ?? "ENTITY";
}

export interface PromptExtractionRuleFormProps {
  initial        : PromptExtractionRuleItem | null;
  defaultRuleType: PromptRuleType;
  bookTypes      : BookTypeItem[];
  redirectTo     : string;
  onSuccess?     : () => void;
  onCancel?      : () => void;
}

export function PromptExtractionRuleForm({ initial, defaultRuleType, bookTypes, redirectTo, onSuccess, onCancel }: PromptExtractionRuleFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [localRuleType, setLocalRuleType] = useState<PromptRuleType>(initial?.ruleType ?? defaultRuleType);
  const [content,       setContent]       = useState(initial?.content ?? "");
  const [bookTypeId,    setBookTypeId]    = useState(initial?.bookTypeId ?? GLOBAL_BOOK_TYPE_VALUE);
  const [sortOrder,     setSortOrder]     = useState(initial?.sortOrder ?? 1);
  const [changeNote,    setChangeNote]    = useState(initial?.changeNote ?? "");
  const [isActive,      setIsActive]      = useState(initial?.isActive ?? true);
  const [saving,        setSaving]        = useState(false);

  useEffect(() => {
    if (!initial) return;
    setLocalRuleType(initial.ruleType);
    setContent(initial.content);
    setBookTypeId(initial.bookTypeId ?? GLOBAL_BOOK_TYPE_VALUE);
    setSortOrder(initial.sortOrder);
    setChangeNote(initial.changeNote ?? "");
    setIsActive(initial.isActive);
  }, [initial]);

  async function handleSubmit() {
    setSaving(true);
    try {
      if (initial) {
        await updatePromptExtractionRule(initial.id, {
          content,
          bookTypeId: bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : null,
          sortOrder,
          changeNote: changeNote || undefined,
          isActive
        });
      } else {
        await createPromptExtractionRule({
          ruleType  : localRuleType,
          content,
          bookTypeId: bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : undefined,
          sortOrder,
          changeNote: changeNote || undefined
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
    <div className="grid max-w-3xl gap-4">
      <div className="grid gap-2">
        <Label>规则类型</Label>
        <Select value={localRuleType} onValueChange={(value) => setLocalRuleType(parsePromptRuleType(value))} disabled={Boolean(initial)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {RULE_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>规则内容</Label>
        <Textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>书籍类型</Label>
          <Select value={bookTypeId} onValueChange={setBookTypeId}>
            <SelectTrigger><SelectValue placeholder="选择书籍类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={GLOBAL_BOOK_TYPE_VALUE}>通用规则</SelectItem>
              {bookTypes.map((bookType) => (
                <SelectItem key={bookType.id} value={bookType.id}>{bookType.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>排序</Label>
          <Input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>变更说明</Label>
        <Input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} />
      </div>
      {initial ? (
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>启用</Label>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.push(redirectTo)} disabled={saving}>取消</Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !content.trim()}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}
