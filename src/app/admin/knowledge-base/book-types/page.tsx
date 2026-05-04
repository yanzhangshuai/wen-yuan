"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ChevronRight, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";

import {
  type BookTypeItem,
  fetchBookTypes,
  deleteBookType
} from "@/lib/services/book-types";
import { BookTypeForm } from "./_components/book-type-form";

/**
 * `/admin/knowledge-base/book-types`
 * 书籍类型管理列表页。
 *
 * 重构（05-02）：
 * - 编辑改为路由级整页表单：`/admin/knowledge-base/book-types/[id]/edit`
 * - 新增改为列表页内联面板（PageSection 内 X 关闭）。
 * - 删除仍使用 `<AlertDialog>`（仅作确认，非编辑表单）。
 */
export default function BookTypesPage() {
  const [items,        setItems]        = useState<BookTypeItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<BookTypeItem | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [creating,     setCreating]     = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchBookTypes();
      setItems(data);
    } catch (e) {
      toast({ title: "加载失败", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const handleDeleteConfirmed = async (item: BookTypeItem) => {
    setDeleting(true);
    try {
      await deleteBookType(item.id);
      toast({ title: "删除成功" });
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast({ title: "删除失败", description: String(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="书籍类型管理"
        description="管理古典文学书籍类型及其 NER 调谐配置"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "书籍类型" }
        ]}
      >
        <Button type="button" size="sm" onClick={() => setCreating(true)} disabled={creating}>
          <Plus className="mr-1 h-4 w-4" />
          新增类型
        </Button>
      </PageHeader>

      {creating ? (
        <PageSection>
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">新增书籍类型</h3>
                <div className="mt-1 text-xs text-muted-foreground">录入新的古典文学书籍类型及其 NER 调谐配置。</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="关闭"
                onClick={() => setCreating(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <BookTypeForm
              onSuccess={() => { setCreating(false); void load(); }}
              onCancel={() => setCreating(false)}
            />
          </div>
        </PageSection>
      ) : null}

      <PageSection>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">暂无书籍类型</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Key</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead className="w-24">知识包数</TableHead>
                  <TableHead className="w-24">书籍数</TableHead>
                  <TableHead className="w-20">排序</TableHead>
                  <TableHead className="w-20">状态</TableHead>
                  <TableHead className="w-40">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.key}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item._count.knowledgePacks}</TableCell>
                    <TableCell>{item._count.books}</TableCell>
                    <TableCell>{item.sortOrder}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? "success" : "secondary"}>
                        {item.isActive ? "启用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          asChild
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`编辑书籍类型 ${item.name}`}
                        >
                          <Link href={`/admin/knowledge-base/book-types/${item.id}/edit`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`删除书籍类型 ${item.name}`}
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button asChild variant="ghost" size="icon-sm" aria-label={`查看 ${item.name} 的知识包`}>
                          <Link href={`/admin/knowledge-base/alias-packs?bookTypeId=${item.id}`}>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除书籍类型</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除书籍类型「{deleteTarget?.name ?? ""}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || !deleteTarget}
              onClick={() => {
                if (deleteTarget) {
                  void handleDeleteConfirmed(deleteTarget);
                }
              }}
            >
              {deleting ? "删除中..." : "删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
