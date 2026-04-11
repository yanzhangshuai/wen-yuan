"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  createBookType,
  updateBookType,
  deleteBookType
} from "@/lib/services/book-types";

/**
 * `/admin/knowledge-base/book-types`
 * 书籍类型管理页。
 */
export default function BookTypesPage() {
  const [items, setItems] = useState<BookTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BookTypeItem | null>(null);
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

  const handleCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: BookTypeItem) => {
    setEditing(item);
    setDialogOpen(true);
  };

  const handleDelete = async (item: BookTypeItem) => {
    if (!confirm(`确定删除书籍类型「${item.name}」吗？`)) return;
    try {
      await deleteBookType(item.id);
      toast({ title: "删除成功" });
      await load();
    } catch (e) {
      toast({ title: "删除失败", description: String(e), variant: "destructive" });
    }
  };

  const handleDialogSave = async (data: {
    key: string; name: string; description?: string;
    presetConfig?: Record<string, unknown>; sortOrder?: number; isActive?: boolean;
  }) => {
    try {
      if (editing) {
        await updateBookType(editing.id, data);
        toast({ title: "更新成功" });
      } else {
        await createBookType(data);
        toast({ title: "创建成功" });
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast({ title: "保存失败", description: String(e), variant: "destructive" });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="书籍类型管理"
        description="管理古典文学书籍类型及其 NER 调谐配置"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "书籍类型" }
        ]}
      >
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          新增类型
        </Button>
      </PageHeader>

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
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleDelete(item)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Link href={`/admin/knowledge-base/alias-packs?bookTypeId=${item.id}`}>
                          <Button variant="ghost" size="sm">
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>

      <BookTypeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSave={handleDialogSave}
      />
    </PageContainer>
  );
}

/** 书籍类型编辑弹窗 */
function BookTypeDialog({
  open,
  onOpenChange,
  editing,
  onSave
}: {
  open        : boolean;
  onOpenChange: (open: boolean) => void;
  editing     : BookTypeItem | null;
  onSave      : (data: {
    key: string; name: string; description?: string;
    presetConfig?: Record<string, unknown>; sortOrder?: number; isActive?: boolean;
  }) => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [presetConfigStr, setPresetConfigStr] = useState("{}");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setKey(editing.key);
      setName(editing.name);
      setDescription(editing.description ?? "");
      setPresetConfigStr(editing.presetConfig ? JSON.stringify(editing.presetConfig, null, 2) : "{}");
      setSortOrder(editing.sortOrder);
      setIsActive(editing.isActive);
    } else {
      setKey("");
      setName("");
      setDescription("");
      setPresetConfigStr("{}");
      setSortOrder(0);
      setIsActive(true);
    }
  }, [editing, open]);

  const handleSubmit = async () => {
    let presetConfig: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(presetConfigStr) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        presetConfig = parsed as Record<string, unknown>;
      }
    } catch {
      // 忽略 JSON 解析错误，presetConfig 保持 undefined
    }

    setSaving(true);
    try {
      await onSave({ key, name, description: description || undefined, presetConfig, sortOrder, isActive });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑书籍类型" : "新增书籍类型"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Key（唯一标识）</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="如：历史演义" disabled={!!editing} />
          </div>
          <div className="grid gap-2">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：历史演义小说" />
          </div>
          <div className="grid gap-2">
            <Label>描述</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid gap-2">
            <Label>NER 调谐配置（JSON）</Label>
            <Textarea
              value={presetConfigStr}
              onChange={(e) => setPresetConfigStr(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              placeholder='{"exemptGenericTitles": [], "additionalTitlePatterns": []}'
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>排序</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>启用</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={!key || !name || saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
