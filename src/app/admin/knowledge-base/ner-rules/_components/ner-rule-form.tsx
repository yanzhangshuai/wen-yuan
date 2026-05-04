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
import { type BookTypeItem } from "@/lib/services/book-types";
import {
  createNerLexiconRule,
  updateNerLexiconRule,
  type NerLexiconRuleItem,
  type NerLexiconRuleType
} from "@/lib/services/ner-rules";

const GLOBAL_BOOK_TYPE_VALUE = "__GLOBAL_BOOK_TYPE__";

const RULE_TYPE_OPTIONS: Array<{ value: NerLexiconRuleType; label: string }> = [
  { value: "HARD_BLOCK_SUFFIX", label: "强阻断后缀" },
  { value: "SOFT_BLOCK_SUFFIX", label: "软阻断后缀" },
  { value: "TITLE_STEM",        label: "称谓词干" },
  { value: "POSITION_STEM",     label: "职位词干" }
];

function parseRuleType(value: string): NerLexiconRuleType {
  return RULE_TYPE_OPTIONS.find((o) => o.value === value)?.value ?? "HARD_BLOCK_SUFFIX";
}

export interface NerRuleFormProps {
  initial   : NerLexiconRuleItem | null;
  ruleType  : NerLexiconRuleType;
  bookTypes : BookTypeItem[];
  redirectTo: string;
  onSuccess?: () => void;
  onCancel? : () => void;
}

export function NerRuleForm({ initial, ruleType, bookTypes, redirectTo, onSuccess, onCancel }: NerRuleFormProps) {
  const router  = useRouter();
  const { toast } = useToast();

  const [localRuleType, setLocalRuleType] = useState<NerLexiconRuleType>(initial?.ruleType ?? ruleType);
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
    if (!content.trim()) {
      toast({ title: "请填写词典内容", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await updateNerLexiconRule(initial.id, {
          content,
          bookTypeId: bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : null,
          sortOrder,
          changeNote: changeNote || undefined,
          isActive
        });
        toast({ title: "更新成功" });
      } else {
        await createNerLexiconRule({
          ruleType  : localRuleType,
          content,
          bookTypeId: bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : undefined,
          sortOrder,
          changeNote: changeNote || undefined
        });
        toast({ title: "创建成功" });
      }
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
    <div className="grid max-w-2xl gap-4">
      <div className="grid gap-2">
        <Label>规则类型</Label>
        <Select value={localRuleType} onValueChange={(value) => setLocalRuleType(parseRuleType(value))} disabled={Boolean(initial)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {RULE_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>词典内容（词条、后缀或词干）</Label>
        <Textarea rows={4} value={content} onChange={(event) => setContent(event.target.value)} placeholder="每行一个词条，或输入单个模式" />
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
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.push(redirectTo)} disabled={saving}>
          取消
        </Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !content.trim()}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}
