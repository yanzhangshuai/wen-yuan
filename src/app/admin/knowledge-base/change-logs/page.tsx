"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Eye, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  fetchChangeLogs,
  type KnowledgeChangeLogPage
} from "@/lib/services/change-logs";

type ActionFilter = "all" | "CREATE" | "UPDATE" | "DELETE" | "ACTIVATE" | "IMPORT" | "GENERATE";

export default function ChangeLogsPage() {
  const [pageData, setPageData] = useState<KnowledgeChangeLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [objectType, setObjectType] = useState("");
  const [action, setAction] = useState<ActionFilter>("all");
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchChangeLogs({
        objectType: objectType.trim() || undefined,
        action    : action === "all" ? undefined : action,
        page      : 1,
        pageSize  : 50
      });
      setPageData(data);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [action, objectType, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageContainer>
      <PageHeader
        title="变更日志"
        description="查看知识库对象的创建、修改、激活、导入与生成记录。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "变更日志" }
        ]}
      />

      <PageSection>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_200px_auto]">
          <div className="space-y-2">
            <Label>对象类型</Label>
            <Input value={objectType} onChange={(event) => setObjectType(event.target.value)} placeholder="例如：SURNAME / PROMPT_TEMPLATE" />
          </div>
          <div className="space-y-2">
            <Label>动作</Label>
            <Select value={action} onValueChange={(value) => setAction(value as ActionFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部动作</SelectItem>
                <SelectItem value="CREATE">CREATE</SelectItem>
                <SelectItem value="UPDATE">UPDATE</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
                <SelectItem value="ACTIVATE">ACTIVATE</SelectItem>
                <SelectItem value="IMPORT">IMPORT</SelectItem>
                <SelectItem value="GENERATE">GENERATE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              刷新
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">动作</TableHead>
                  <TableHead className="w-40">对象类型</TableHead>
                  <TableHead>对象名称</TableHead>
                  <TableHead className="w-44">操作人</TableHead>
                  <TableHead className="w-48">时间</TableHead>
                  <TableHead className="w-20">详情</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageData?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell><Badge variant="secondary">{item.action}</Badge></TableCell>
                    <TableCell>{item.objectType}</TableCell>
                    <TableCell>{item.objectName}</TableCell>
                    <TableCell>{item.operatorId ?? "系统/未知"}</TableCell>
                    <TableCell>{new Date(item.createdAt).toLocaleString("zh-CN")}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm" aria-label="查看详情">
                        <Link href={`/admin/knowledge-base/change-logs/${item.id}`}>
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
}
