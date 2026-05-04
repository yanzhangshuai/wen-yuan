"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { KNOWLEDGE_ENTRY_TYPE_OPTIONS } from "@/lib/knowledge-presentation";
import { createEntry } from "@/lib/services/knowledge";

import { AliasChipsInput, normalizeAliasValues } from "./alias-chips-input";

type EntryTypeValue = "CHARACTER" | "LOCATION" | "ORGANIZATION";

export function EntryForm({
  packId,
  redirectTo,
  onSuccess,
  onCancel
}: {
  packId    : string;
  redirectTo: string;
  onSuccess?: () => void;
  onCancel? : () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [canonicalName, setCanonicalName] = useState("");
  const [aliases, setAliases]             = useState<string[]>([]);
  const [entryType, setEntryType]         = useState<EntryTypeValue>("CHARACTER");
  const [notes, setNotes]                 = useState("");
  const [saving, setSaving]               = useState(false);

  async function handleSubmit() {
    const trimmedName = canonicalName.trim();
    if (!trimmedName) {
      toast({ title: "标准名不能为空", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await createEntry(packId, {
        canonicalName: trimmedName,
        aliases      : normalizeAliasValues(aliases.filter((alias) => alias !== trimmedName)),
        entryType,
        notes        : notes.trim() ? notes.trim() : undefined
      });
      toast({ title: "条目创建成功" });
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(redirectTo);
        router.refresh();
      }
    } catch (error) {
      toast({ title: "创建失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label>标准名（canonicalName）</Label>
        <Input value={canonicalName} onChange={(event) => setCanonicalName(event.target.value)} placeholder="如：关羽" />
      </div>
      <div className="grid gap-2">
        <Label>条目类型</Label>
        <Select value={entryType} onValueChange={(value) => setEntryType(value as EntryTypeValue)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {KNOWLEDGE_ENTRY_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>别名</Label>
        <AliasChipsInput
          values={aliases}
          onChange={setAliases}
          placeholder="输入别名后按 Enter、逗号或失焦添加"
        />
      </div>
      <div className="grid gap-2">
        <Label>备注</Label>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.push(redirectTo)}> 取消</Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !canonicalName.trim()}>
          {saving ? "添加中..." : "添加"}
        </Button>
      </div>
    </div>
  );
}
