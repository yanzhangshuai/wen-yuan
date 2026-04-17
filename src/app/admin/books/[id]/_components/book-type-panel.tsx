"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/_components/book-type-panel.tsx`
 * ----------------------------------------------------------------------------
 * 这是书籍详情页"体裁"面板（客户端组件），由 BookDetailTabs 挂载。
 *
 * 业务职责：
 * - 展示并允许管理员切换 `Book.typeCode`（三阶段管线 BookTypeCode 分类）；
 * - 切换成功后提示"下次解析任务才会使用新 BookType 对应的 Prompt 与阈值"。
 *
 * 协作关系：
 * - 上游：`BookDetailTabs`，传入 bookId；
 * - 下游：`GET /api/admin/books/:id`（读取当前 typeCode），`PATCH /api/admin/books/:id`（更新）。
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { clientFetch } from "@/lib/client-api";
import {
  BOOK_TYPE_CODE_OPTIONS,
  updateAdminBookTypeCode,
  type BookTypeCode
} from "@/lib/services/books";

interface BookTypePanelProps {
  /** 书籍 ID。 */
  bookId: string;
}

/** 管理端书籍详情接口返回的最小片段（只关心 typeCode）。 */
interface AdminBookSnapshot {
  typeCode: BookTypeCode;
}

/**
 * 书籍 BookTypeCode 编辑面板。
 * 设计为"读取 → 编辑 → 保存"三步，保存后需手动重新运行解析任务才会生效。
 */
export function BookTypePanel({ bookId }: BookTypePanelProps) {
  /** 当前数据库中的 typeCode（用于 disable 保存按钮）。 */
  const [persisted, setPersisted] = useState<BookTypeCode | null>(null);

  /** 表单编辑中的 typeCode。 */
  const [draft, setDraft] = useState<BookTypeCode>("GENERIC");

  /** 首屏加载状态。 */
  const [loading, setLoading] = useState(true);

  /** 保存进行中状态，防止重复点击。 */
  const [saving, setSaving] = useState(false);

  /** 加载错误文案。 */
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    clientFetch<AdminBookSnapshot>(`/api/admin/books/${encodeURIComponent(bookId)}`)
      .then((snapshot) => {
        if (cancelled) return;
        setPersisted(snapshot.typeCode);
        setDraft(snapshot.typeCode);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "体裁信息加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  async function handleSave() {
    if (!persisted || draft === persisted) return;
    setSaving(true);
    try {
      const result = await updateAdminBookTypeCode(bookId, draft);
      setPersisted(result.typeCode);
      toast.success("体裁已更新；下次解析任务将按新类型装配 Prompt 与阈值。");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "体裁更新失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载体裁信息…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>解析体裁（BookTypeCode）</CardTitle>
        <CardDescription>
          决定三阶段解析管线使用的 Prompt 变体与阈值。修改后不会自动重解，需要手动重新运行解析任务。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="book-type-code" className="text-sm font-medium">体裁</label>
          <Select value={draft} onValueChange={(value) => setDraft(value as BookTypeCode)}>
            <SelectTrigger id="book-type-code" className="w-full md:w-[360px]">
              <SelectValue placeholder="选择体裁" />
            </SelectTrigger>
            <SelectContent>
              {BOOK_TYPE_CODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  <span className="text-muted-foreground ml-2 text-xs">{option.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => { void handleSave(); }}
            disabled={saving || !persisted || draft === persisted}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中…
              </>
            ) : "保存"}
          </Button>
          {persisted && draft !== persisted && (
            <span className="text-xs text-muted-foreground">
              未保存更改：保存后需要重新运行解析任务才生效。
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
