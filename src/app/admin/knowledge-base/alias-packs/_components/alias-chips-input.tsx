"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function normalizeAliasValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function AliasChipsInput({
  values,
  onChange,
  placeholder,
  disabled = false
}: {
  values      : string[];
  onChange    : (values: string[]) => void;
  placeholder?: string;
  disabled?   : boolean;
}) {
  const [inputValue, setInputValue] = useState("");

  const commitAliases = useCallback((rawValue: string) => {
    const nextAliases = normalizeAliasValues(rawValue.split(/[，,\n]/));
    if (nextAliases.length === 0) {
      setInputValue("");
      return;
    }

    onChange(normalizeAliasValues([...values, ...nextAliases]));
    setInputValue("");
  }, [onChange, values]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" && event.key !== "," && event.key !== "，") {
      return;
    }

    event.preventDefault();
    commitAliases(inputValue);
  };

  return (
    <div className="grid gap-2">
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2">
        {values.map((alias) => (
          <Badge key={alias} variant="secondary" className="gap-1 pr-1 text-xs">
            {alias}
            <button
              type="button"
              aria-label={`删除别名 ${alias}`}
              className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-black/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => onChange(values.filter((value) => value !== alias))}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commitAliases(inputValue)}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
      <div className="text-xs text-muted-foreground">按 Enter、英文/中文逗号或离开输入框即可添加别名，点击 × 删除。</div>
    </div>
  );
}
