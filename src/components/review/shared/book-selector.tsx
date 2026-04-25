"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface BookOption {
  id   : string;
  title: string;
}

interface BookSelectorProps {
  books        : BookOption[];
  currentBookId: string;
  basePath     : string;
}

export function BookSelector({ books, currentBookId, basePath }: BookSelectorProps) {
  const [open, setOpen] = useState(false);
  const current = books.find((b) => b.id === currentBookId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant      ="outline"
          role         ="button"
          aria-expanded={open}
          className    ="w-64 justify-between"
        >
          <span className="truncate">{current?.title ?? "选择书籍"}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索书名…" />
          <CommandList>
            <CommandEmpty>未找到相关书籍</CommandEmpty>
            <CommandGroup>
              {books.map((b) => (
                <CommandItem key={b.id} value={b.title} asChild>
                  <Link
                    href     ={`${basePath}/${b.id}`}
                    className="flex w-full items-center gap-2"
                    onClick  ={() => setOpen(false)}
                  >
                    <Check className={cn("h-4 w-4", b.id === currentBookId ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{b.title}</span>
                  </Link>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
