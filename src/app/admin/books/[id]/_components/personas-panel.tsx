"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { fetchBookPersonas, type BookPersonaListItem } from "@/lib/services/books";

interface PersonasPanelProps {
  bookId: string;
}

function PersonaStatusBadge({ status }: { status: string }) {
  if (status === "VERIFIED") {
    return <Badge variant="success">已审核</Badge>;
  }
  if (status === "DRAFT") {
    return <Badge variant="secondary">待审核</Badge>;
  }
  if (status === "REJECTED") {
    return <Badge variant="destructive">已拒绝</Badge>;
  }
  return <Badge variant="default">{status}</Badge>;
}

function IronyBar({ value }: { value: number }) {
  const pct = Math.round((value / 10) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  );
}

export function PersonasPanel({ bookId }: PersonasPanelProps) {
  const [personas, setPersonas] = useState<BookPersonaListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBookPersonas(bookId)
      .then(data => { if (!cancelled) setPersonas(data); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "加载失败"); });
    return () => { cancelled = true; };
  }, [bookId]);

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!personas) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={16} className="animate-spin" />
          加载人物列表...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">提取人物</CardTitle>
        <CardDescription>共 {personas.length} 位人物。</CardDescription>
      </CardHeader>
      <CardContent>
        {personas.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无人物，请先完成书籍解析。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs border-b border-border">
                  <th className="px-4 py-2 text-left">姓名</th>
                  <th className="px-4 py-2 text-left">书中称谓</th>
                  <th className="px-4 py-2 text-left">性别</th>
                  <th className="px-4 py-2 text-left">官职</th>
                  <th className="px-4 py-2 text-left">别名</th>
                  <th className="px-4 py-2 text-left">书内标签</th>
                  <th className="px-4 py-2 text-left w-28">讽刺指数</th>
                  <th className="px-4 py-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {personas.map(p => (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.localName || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.gender ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.officialTitle ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.aliases.length > 0 ? p.aliases.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.localTags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.localTags.map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <IronyBar value={p.ironyIndex} />
                    </td>
                    <td className="px-4 py-3">
                      <PersonaStatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
