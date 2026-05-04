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
import { createSurname, updateSurname, type SurnameItem } from "@/lib/services/surnames";
import { type BookTypeItem } from "@/lib/services/book-types";

const NO_BOOK_TYPE = "all";

export function SurnameForm({
  initial,
  bookTypes,
  redirectTo,
  onSuccess,
  onCancel
}: {
  initial   : SurnameItem | null;
  bookTypes : BookTypeItem[];
  redirectTo: string;
  onSuccess?: () => void;
  onCancel? : () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [surname, setSurname]         = useState("");
  const [isCompound, setIsCompound]   = useState(false);
  const [priority, setPriority]       = useState(0);
  const [description, setDescription] = useState("");
  const [bookTypeId, setBookTypeId]   = useState<string>(NO_BOOK_TYPE);
  const [isActive, setIsActive]       = useState(true);
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    setSurname(initial?.surname ?? "");
    setIsCompound(initial?.isCompound ?? false);
    setPriority(initial?.priority ?? 0);
    setDescription(initial?.description ?? "");
    setBookTypeId(initial?.bookTypeId ?? NO_BOOK_TYPE);
    setIsActive(initial?.isActive ?? true);
  }, [initial]);

  async function handleSubmit() {
    setSaving(true);
    try {
      if (initial) {
        await updateSurname(initial.id, {
          priority,
          description: description || undefined,
          bookTypeId : bookTypeId === NO_BOOK_TYPE ? null : bookTypeId,
          isActive
        });
      } else {
        await createSurname({
          surname,
          isCompound,
          priority,
          description: description || undefined,
          bookTypeId : bookTypeId === NO_BOOK_TYPE ? undefined : bookTypeId
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
          <Label>姓氏</Label>
          <Input value={surname} onChange={(event) => setSurname(event.target.value)} disabled={!!initial} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>优先级</Label>
            <Input type="number" value={priority} onChange={(event) => setPriority(Number(event.target.value))} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch checked={isCompound} onCheckedChange={setIsCompound} disabled={!!initial} />
            <Label>复姓</Label>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>适用题材</Label>
          <Select value={bookTypeId} onValueChange={setBookTypeId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_BOOK_TYPE}>通用</SelectItem>
              {bookTypes.map((bookType) => (
                <SelectItem key={bookType.id} value={bookType.id}>{bookType.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.push(redirectTo)}> 取消</Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !surname.trim()}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}
