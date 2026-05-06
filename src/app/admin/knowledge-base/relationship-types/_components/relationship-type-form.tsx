"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { fetchActiveBookTypes, type BookTypeOption } from "@/lib/services/book-types";
import {
  createRelationshipType,
  RELATIONSHIP_DIRECTION_MODES,
  RELATIONSHIP_TYPE_GROUPS,
  RELATIONSHIP_TYPE_STATUSES,
  updateRelationshipType,
  type RelationshipDirectionMode,
  type RelationshipTypeGroup,
  type RelationshipTypeItem,
  type RelationshipTypePayload,
  type RelationshipTypeStatus
} from "@/lib/services/relationship-types";

const GLOBAL_BOOK_TYPE_VALUE = "__GLOBAL__";

const directionLabels: Record<RelationshipDirectionMode, string> = {
  SYMMETRIC: "对称",
  INVERSE  : "互逆",
  DIRECTED : "单向"
};

const statusLabels: Record<RelationshipTypeStatus, string> = {
  ACTIVE        : "启用",
  INACTIVE      : "停用",
  PENDING_REVIEW: "待审核"
};

interface FormState {
  id?             : string;
  bookTypeId      : string;
  name            : string;
  group           : RelationshipTypeGroup;
  directionMode   : RelationshipDirectionMode;
  sourceRoleLabel : string;
  targetRoleLabel : string;
  edgeLabel       : string;
  reverseEdgeLabel: string;
  aliasesText     : string;
  description     : string;
  usageNotes      : string;
  examplesText    : string;
  color           : string;
  sortOrder       : number;
  status          : RelationshipTypeStatus;
}

function emptyForm(): FormState {
  return {
    bookTypeId      : GLOBAL_BOOK_TYPE_VALUE,
    name            : "",
    group           : "血缘",
    directionMode   : "INVERSE",
    sourceRoleLabel : "",
    targetRoleLabel : "",
    edgeLabel       : "",
    reverseEdgeLabel: "",
    aliasesText     : "",
    description     : "",
    usageNotes      : "",
    examplesText    : "",
    color           : "",
    sortOrder       : 0,
    status          : "ACTIVE"
  };
}

function itemToForm(item: RelationshipTypeItem): FormState {
  return {
    id              : item.id,
    bookTypeId      : item.bookTypeId ?? GLOBAL_BOOK_TYPE_VALUE,
    name            : item.name,
    group           : item.group,
    directionMode   : item.directionMode,
    sourceRoleLabel : item.sourceRoleLabel ?? "",
    targetRoleLabel : item.targetRoleLabel ?? "",
    edgeLabel       : item.edgeLabel,
    reverseEdgeLabel: item.reverseEdgeLabel ?? "",
    aliasesText     : item.aliases.join("，"),
    description     : item.description ?? "",
    usageNotes      : item.usageNotes ?? "",
    examplesText    : item.examples.join("，"),
    color           : item.color ?? "",
    sortOrder       : item.sortOrder,
    status          : item.status
  };
}

function splitList(value: string): string[] {
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function formToPayload(form: FormState): RelationshipTypePayload {
  return {
    bookTypeId      : form.bookTypeId === GLOBAL_BOOK_TYPE_VALUE ? null : form.bookTypeId,
    name            : form.name.trim(),
    group           : form.group,
    directionMode   : form.directionMode,
    sourceRoleLabel : form.sourceRoleLabel.trim() || null,
    targetRoleLabel : form.targetRoleLabel.trim() || null,
    edgeLabel       : form.edgeLabel.trim() || form.name.trim(),
    reverseEdgeLabel: form.reverseEdgeLabel.trim() || null,
    aliases         : splitList(form.aliasesText),
    description     : form.description.trim() || null,
    usageNotes      : form.usageNotes.trim() || null,
    examples        : splitList(form.examplesText),
    color           : form.color.trim() || null,
    sortOrder       : form.sortOrder,
    status          : form.status
  };
}

function previewLabels(form: FormState) {
  const edgeLabel = form.edgeLabel.trim() || form.name.trim() || "关系";
  if (form.directionMode === "SYMMETRIC") {
    return { aToB: edgeLabel, bToA: edgeLabel, edge: edgeLabel };
  }
  return {
    aToB: form.targetRoleLabel.trim() || edgeLabel,
    bToA: form.sourceRoleLabel.trim() || form.reverseEdgeLabel.trim() || edgeLabel,
    edge: edgeLabel
  };
}

export interface RelationshipTypeFormProps {
  initial   : RelationshipTypeItem | null;
  redirectTo: string;
  onSuccess?: () => void;
  onCancel? : () => void;
}

export function RelationshipTypeForm({ initial, redirectTo, onSuccess, onCancel }: RelationshipTypeFormProps) {
  const router = useRouter();
  const [form,   setForm]   = useState<FormState>(() => initial ? itemToForm(initial) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [bookTypes, setBookTypes] = useState<BookTypeOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchActiveBookTypes();
        if (!cancelled) setBookTypes(data);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "书籍类型加载失败");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const preview = previewLabels(form);

  async function handleSubmit() {
    const payload = formToPayload(form);
    if (!payload.name) {
      toast.error("关系名称不能为空");
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await updateRelationshipType(form.id, payload);
        toast.success("关系类型已更新");
      } else {
        await createRelationshipType(payload);
        toast.success("关系类型已创建");
      }
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(redirectTo);
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="关系名称" id="name">
          <Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="岳婿" />
        </Field>
        <FormSelect label="分组" value={form.group} values={[...RELATIONSHIP_TYPE_GROUPS]} getLabel={(value) => value} onValueChange={(value) => setForm({ ...form, group: value as RelationshipTypeGroup })} />
      </div>
      <FormSelect
        label="适用书籍类型"
        value={form.bookTypeId}
        values={[GLOBAL_BOOK_TYPE_VALUE, ...bookTypes.map((item) => item.id)]}
        getLabel={(value) => value === GLOBAL_BOOK_TYPE_VALUE ? "通用" : bookTypes.find((item) => item.id === value)?.name ?? value}
        onValueChange={(value) => setForm({ ...form, bookTypeId: value })}
      />
      <FormSelect label="方向模式" value={form.directionMode} values={[...RELATIONSHIP_DIRECTION_MODES]} getLabel={(value) => directionLabels[value as RelationshipDirectionMode]} onValueChange={(value) => setForm({ ...form, directionMode: value as RelationshipDirectionMode })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="source 称谓" id="sourceRoleLabel">
          <Input id="sourceRoleLabel" value={form.sourceRoleLabel} onChange={(event) => setForm({ ...form, sourceRoleLabel: event.target.value })} placeholder="岳父" />
        </Field>
        <Field label="target 称谓" id="targetRoleLabel">
          <Input id="targetRoleLabel" value={form.targetRoleLabel} onChange={(event) => setForm({ ...form, targetRoleLabel: event.target.value })} placeholder="女婿" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="图谱边标签" id="edgeLabel">
          <Input id="edgeLabel" value={form.edgeLabel} onChange={(event) => setForm({ ...form, edgeLabel: event.target.value })} placeholder="默认使用关系名称" />
        </Field>
        <Field label="反向边标签" id="reverseEdgeLabel">
          <Input id="reverseEdgeLabel" value={form.reverseEdgeLabel} onChange={(event) => setForm({ ...form, reverseEdgeLabel: event.target.value })} />
        </Field>
      </div>
      <Field label="别名/同义词" id="aliasesText">
        <Textarea id="aliasesText" value={form.aliasesText} onChange={(event) => setForm({ ...form, aliasesText: event.target.value })} placeholder="用逗号或换行分隔" />
      </Field>
      <Field label="定义说明" id="description">
        <Textarea id="description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </Field>
      <Field label="使用边界" id="usageNotes">
        <Textarea id="usageNotes" value={form.usageNotes} onChange={(event) => setForm({ ...form, usageNotes: event.target.value })} placeholder="说明不要与行为/态度标签混淆" />
      </Field>
      <Field label="例子" id="examplesText">
        <Textarea id="examplesText" value={form.examplesText} onChange={(event) => setForm({ ...form, examplesText: event.target.value })} placeholder="胡屠户与范进" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="图谱颜色" id="color">
          <Input id="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} placeholder="#8b5cf6 或 CSS 变量" />
        </Field>
        <Field label="排序" id="sortOrder">
          <Input id="sortOrder" type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} />
        </Field>
      </div>
      <FormSelect label="状态" value={form.status} values={[...RELATIONSHIP_TYPE_STATUSES]} getLabel={(value) => statusLabels[value as RelationshipTypeStatus]} onValueChange={(value) => setForm({ ...form, status: value as RelationshipTypeStatus })} />
      <div className="rounded-md bg-muted p-3 text-sm">
        <div className="font-medium">反向预览</div>
        <div className="mt-1 text-muted-foreground">A 对 B：{preview.aToB}；B 对 A：{preview.bToA}；图谱边：{preview.edge}</div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.push(redirectTo)} disabled={saving}>取消</Button>
        <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
      </div>
    </div>
  );
}

interface FieldProps {
  label   : string;
  id      : string;
  children: ReactNode;
}

function Field({ label, id, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

interface FormSelectProps {
  label        : string;
  value        : string;
  values       : string[];
  getLabel     : (value: string) => string;
  onValueChange: (value: string) => void;
}

function FormSelect({ label, value, values, getLabel, onValueChange }: FormSelectProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>{getLabel(item)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
