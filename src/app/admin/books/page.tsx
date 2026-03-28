import { listBooks } from "@/server/modules/books/listBooks";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Trash2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"; 

/* Server Component for Page */
export default async function AdminBooksPage() {
  const books = await listBooks();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">书库管理</h1>
          <p className="text-muted-foreground mt-1">管理系统内所有书籍及其解析状态</p>
        </div>
        <Link href="/admin/books/import">
          <Button className="gap-2">
            <Plus size={16} />
            导入新书
          </Button>
        </Link>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>书名</TableHead>
              <TableHead>作者</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>章节/人物</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {books.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  暂无书籍，请点击右上角导入。
                </TableCell>
              </TableRow>
            ) : (
              books.map((book) => (
                <TableRow key={book.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-muted-foreground" />
                      {book.title}
                    </div>
                  </TableCell>
                  <TableCell>{book.author || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={
                      book.status === "COMPLETED" ? "success" : 
                      book.status === "PROCESSING" ? "warning" : 
                      book.status === "ERROR" ? "destructive" : "secondary"
                    }>
                      {book.status === "COMPLETED" ? "已完成" :
                       book.status === "PROCESSING" ? "解析中" :
                       book.status === "ERROR" ? "失败" : "待处理"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {book.chapterCount}章 / {book.personaCount}人
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                       {/* Mock Actions for MVP */}
                       <Button variant="ghost" size="icon" title="重新解析">
                         <RefreshCw size={16} />
                       </Button>
                       <Button variant="ghost" size="icon" className="text-destructive" title="删除">
                         <Trash2 size={16} />
                       </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
