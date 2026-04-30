"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { BookPersonaListItem } from "@/lib/services/books";

import {
  BIO_CATEGORY_LABELS,
  formatChapterOption,
  type AliasFormState,
  type BiographyFormState,
  type ChapterOption,
  type PersonaFormState,
  type RelationshipFormState,
  type SheetMode
} from "./role-review-utils";

interface PersonaFieldsProps {
  form    : PersonaFormState;
  chapters: ChapterOption[];
  onChange: (form: PersonaFormState) => void;
}

export function PersonaFields({ form, chapters, onChange }: PersonaFieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormInput label="姓名" value={form.name} onChange={(value) => onChange({ ...form, name: value })} />
      <FormInput label="书中称谓" value={form.localName} onChange={(value) => onChange({ ...form, localName: value })} />
      <ChapterSelect
        label="出场章节"
        value={form.firstAppearanceChapterId}
        chapters={chapters}
        allowUnset
        onChange={(value) => onChange({ ...form, firstAppearanceChapterId: value })}
      />
      <FormInput label="别名（顿号分隔）" value={form.aliases} onChange={(value) => onChange({ ...form, aliases: value })} />
      <FormInput label="性别" value={form.gender} onChange={(value) => onChange({ ...form, gender: value })} />
      <FormInput label="籍贯" value={form.hometown} onChange={(value) => onChange({ ...form, hometown: value })} />
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">姓名类型</span>
        <Select value={form.nameType} onValueChange={(value) => onChange({ ...form, nameType: value })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NAMED">正式姓名</SelectItem>
            <SelectItem value="TITLE_ONLY">称谓</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <FormInput label="全局标签（顿号分隔）" value={form.globalTags} onChange={(value) => onChange({ ...form, globalTags: value })} />
      <FormInput label="本书标签（顿号分隔）" value={form.localTags} onChange={(value) => onChange({ ...form, localTags: value })} />
      <FormInput label="官职/头衔" value={form.officialTitle} onChange={(value) => onChange({ ...form, officialTitle: value })} />
      <FormInput label="讽刺指数" type="number" value={form.ironyIndex} onChange={(value) => onChange({ ...form, ironyIndex: value })} />
      <FormInput label="置信度 (%)" type="number" value={form.confidence} onChange={(value) => onChange({ ...form, confidence: value })} />
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block text-muted-foreground">书内小传</span>
        <Textarea value={form.localSummary} onChange={(event) => onChange({ ...form, localSummary: event.target.value })} />
      </label>
    </div>
  );
}

interface RelationshipFieldsProps {
  form            : RelationshipFormState;
  personas        : BookPersonaListItem[];
  chapters        : ChapterOption[];
  currentPersonaId: string;
  isEditing       : boolean;
  onChange        : (form: RelationshipFormState) => void;
}

export function RelationshipFields({
  form,
  personas,
  chapters,
  currentPersonaId,
  isEditing,
  onChange
}: RelationshipFieldsProps) {
  const targetOptions = useMemo(() => {
    return personas.filter(persona => persona.id !== currentPersonaId);
  }, [personas, currentPersonaId]);

  return (
    <div className="grid gap-3">
      {isEditing && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">入向关系编辑的是原始边方向，不会自动反转起点和终点。</p>}
      {!isEditing && (
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">对方角色</span>
          <PersonaSearchSelect
            personas={targetOptions}
            value={form.targetId}
            onChange={(value) => onChange({ ...form, targetId: value })}
          />
        </label>
      )}
      <ChapterSelect value={form.chapterId} chapters={chapters} onChange={(value) => onChange({ ...form, chapterId: value })} />
      <FormInput label="关系类型" value={form.type} onChange={(value) => onChange({ ...form, type: value })} />
      <FormInput label="权重" type="number" value={form.weight} onChange={(value) => onChange({ ...form, weight: value })} />
      <FormInput label="置信度 (%)" type="number" value={form.confidence} onChange={(value) => onChange({ ...form, confidence: value })} />
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">证据</span>
        <Textarea value={form.evidence} onChange={(event) => onChange({ ...form, evidence: event.target.value })} />
      </label>
    </div>
  );
}

interface BiographyFieldsProps {
  form    : BiographyFormState;
  chapters: ChapterOption[];
  onChange: (form: BiographyFormState) => void;
}

export function BiographyFields({ form, chapters, onChange }: BiographyFieldsProps) {
  return (
    <div className="grid gap-3">
      <ChapterSelect value={form.chapterId} chapters={chapters} onChange={(value) => onChange({ ...form, chapterId: value })} />
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">类别</span>
        <Select value={form.category} onValueChange={(value) => onChange({ ...form, category: value })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(BIO_CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <FormInput label="标题" value={form.title} onChange={(value) => onChange({ ...form, title: value })} />
      <FormInput label="地点" value={form.location} onChange={(value) => onChange({ ...form, location: value })} />
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">事件描述</span>
        <Textarea value={form.event} onChange={(event) => onChange({ ...form, event: event.target.value })} />
      </label>
    </div>
  );
}

interface PersonaSearchSelectProps {
  personas: BookPersonaListItem[];
  value   : string;
  onChange: (value: string) => void;
}

function PersonaSearchSelect({ personas, value, onChange }: PersonaSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedPersona = personas.find(persona => persona.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="选择对方角色"
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selectedPersona ? selectedPersona.name : "选择对方角色"}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="搜索角色名、书内名或别名" />
          <CommandList className="max-h-72">
            <CommandEmpty>没有匹配角色</CommandEmpty>
            {personas.map(persona => {
              const searchableValue = [
                persona.name,
                persona.localName,
                ...persona.aliases
              ].join(" ");
              return (
                <CommandItem
                  key={persona.id}
                  value={searchableValue}
                  onSelect={() => {
                    onChange(persona.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === persona.id ? "opacity-100" : "opacity-0")} />
                  <span className="font-medium">{persona.name}</span>
                  {persona.localName !== persona.name && (
                    <span className="text-muted-foreground">{persona.localName}</span>
                  )}
                  {persona.aliases.length > 0 && (
                    <span className="truncate text-xs text-muted-foreground">{persona.aliases.join("、")}</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface ChapterSelectProps {
  value      : string;
  chapters   : ChapterOption[];
  onChange   : (value: string) => void;
  label?     : string;
  allowUnset?: boolean;
}

const NO_CHAPTER_VALUE = "__NO_CHAPTER__";

function ChapterSelect({
  value,
  chapters,
  onChange,
  label = "章节",
  allowUnset = false
}: ChapterSelectProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <Select
        value={value || (allowUnset ? NO_CHAPTER_VALUE : "")}
        onValueChange={(nextValue) => onChange(nextValue === NO_CHAPTER_VALUE ? "" : nextValue)}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder="选择章节" />
        </SelectTrigger>
        <SelectContent>
          {allowUnset && (
            <SelectItem value={NO_CHAPTER_VALUE}>
              未设置
            </SelectItem>
          )}
          {chapters.map(chapter => (
            <SelectItem key={chapter.id} value={chapter.id}>
              {formatChapterOption(chapter)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

interface AliasFieldsProps {
  form    : AliasFormState;
  onChange: (form: AliasFormState) => void;
}

export function AliasFields({ form, onChange }: AliasFieldsProps) {
  return (
    <div className="grid gap-3">
      <FormInput label="别名" value={form.alias} onChange={(value) => onChange({ ...form, alias: value })} />
      <FormInput label="解析姓名" value={form.resolvedName} onChange={(value) => onChange({ ...form, resolvedName: value })} />
      <FormInput label="别名类型" value={form.aliasType} onChange={(value) => onChange({ ...form, aliasType: value })} />
    </div>
  );
}

interface FormInputProps {
  label   : string;
  value   : string;
  onChange: (value: string) => void;
  type?   : string;
}

function FormInput({
  label,
  value,
  onChange,
  type = "text"
}: FormInputProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function getSheetTitle(mode: SheetMode | null): string {
  if (mode === "persona-create") return "新增角色";
  if (mode === "persona-edit") return "编辑角色";
  if (mode === "relationship-create") return "新增关系";
  if (mode === "relationship-edit") return "编辑关系";
  if (mode === "biography-create") return "新增传记事件";
  if (mode === "biography-edit") return "编辑传记事件";
  if (mode === "alias-create") return "新增别名映射";
  return "角色审核";
}

export function getSheetDescription(mode: SheetMode | null): string {
  if (mode === "relationship-create") return "MVP 仅创建当前角色指向对方角色的出向边。";
  if (mode === "relationship-edit") return "请按原始边方向编辑关系字段。";
  if (mode === "persona-create" || mode === "persona-edit") return "角色主档与当前书内档案会一起保存。";
  if (mode === "alias-create") return "手动创建的别名会绑定到当前角色。";
  return "修改后请保存，关闭前会检查未保存输入。";
}
