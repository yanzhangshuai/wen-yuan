"use client";

/**
 * 技能管理：Markdown 编辑器（编辑/预览 切换）。
 * 编辑用等宽 textarea 承载完整 MD（frontmatter + 正文）；预览把 frontmatter
 * 单独渲染为代码块，正文用 react-markdown（GFM 表格/列表）渲染。
 *
 * mode 由父组件受控：父组件需要根据「编辑/预览」决定是否展示保存栏。
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo } from "react";
import { Eye, FilePenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const FRONTMATTER_DELIMITER = "---";

function splitFrontmatter(md: string): { frontmatter: string | null; body: string } {
  const trimmed = md.trimStart();
  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    return { frontmatter: null, body: md };
  }
  const lines = trimmed.split("\n");
  let endIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === FRONTMATTER_DELIMITER) {
      endIndex = index;
      break;
    }
  }
  if (endIndex === -1) {
    return { frontmatter: null, body: md };
  }
  return {
    frontmatter: lines.slice(1, endIndex).join("\n"),
    body       : lines.slice(endIndex + 1).join("\n")
  };
}

interface MarkdownEditorProps {
  value         : string;
  onChange      : (value: string) => void;
  /** 当前编辑/预览模式（受控）。 */
  mode          : "edit" | "preview";
  onModeChange  : (mode: "edit" | "preview") => void;
  /** 仅展示（预览态），不可编辑；点击「编辑」通过 onEditRequest 请求进入编辑模式。 */
  readOnly?     : boolean;
  minHeight?    : string;
  /** 只读态下用户点击「编辑」时回调（父组件负责切换为可编辑）。 */
  onEditRequest?: () => void;
}

export function MarkdownEditor({
  value,
  onChange,
  mode,
  onModeChange,
  readOnly,
  minHeight = "20rem",
  onEditRequest
}: MarkdownEditorProps) {
  const { frontmatter, body } = useMemo(() => splitFrontmatter(value), [value]);

  function handleEditClick() {
    if (readOnly) {
      onEditRequest?.();
      return;
    }
    onModeChange("edit");
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={mode === "edit" && !readOnly ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handleEditClick}
          >
            <FilePenLine className="h-3.5 w-3.5" />
            编辑
          </Button>
          <Button
            type="button"
            variant={mode === "preview" && !readOnly ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => onModeChange("preview")}
          >
            <Eye className="h-3.5 w-3.5" />
            预览
          </Button>
        </div>
        {!readOnly && (
          <span className="text-xs text-muted-foreground">
            {mode === "edit" ? "frontmatter + 正文均可编辑" : "仅预览，点击「编辑」修改"}
          </span>
        )}
      </div>

      {mode === "edit" && !readOnly ? (
        <Textarea
          data-slot="md-editor"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-none border-0 font-mono text-[13px] leading-relaxed focus-visible:ring-0"
          style={{ minHeight }}
        />
      ) : (
        <div className="max-h-[60vh] overflow-auto p-4" style={{ minHeight }}>
          {frontmatter && (
            <pre className="mb-4 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
{frontmatter}
            </pre>
          )}
          <div className="prose prose-sm max-w-none prose-headings:scroll-mt-20 prose-a:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body || "*（空正文）*"}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
