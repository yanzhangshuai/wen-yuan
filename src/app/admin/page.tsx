import Link from "next/link";
import {
  BookOpen,
  Upload,
  CheckCircle,
  Cog,
  Users,
  GitBranch,
  ChevronRight,
  Library,
  ClipboardCheck,
  Settings2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { listBooks } from "@/server/modules/books/listBooks";

const QUICK_ACTIONS = [
  {
    title      : "导入书籍",
    description: "上传新的古典小说文本进行解析",
    icon       : Upload,
    href       : "/admin/books/import"
  },
  {
    title      : "审核数据",
    description: "审核 AI 解析的人物与关系",
    icon       : CheckCircle,
    href       : "/admin/review"
  },
  {
    title      : "模型设置",
    description: "配置 AI 模型与解析参数",
    icon       : Cog,
    href       : "/admin/model"
  }
] as const;

export default async function AdminHomePage() {
  const books = await listBooks();

  const totalBooks = books.length;
  const completedBooks = books.filter(b => b.status === "COMPLETED").length;
  const totalPersonas = books.reduce((acc, b) => acc + (b.personaCount ?? 0), 0);
  const pendingBooks = books.filter(b => b.status === "PENDING" || b.status === "PROCESSING").length;

  const stats = [
    { label: "书籍总数", value: String(totalBooks), icon: BookOpen, sub: `${completedBooks} 已完成` },
    { label: "人物总数", value: totalPersonas.toLocaleString(), icon: Users, sub: "已解析" },
    { label: "关系总数", value: "—", icon: GitBranch, sub: "统计中" },
    { label: "待处理", value: String(pendingBooks), icon: ClipboardCheck, sub: "需处理", warning: pendingBooks > 0 }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="管理后台"
        description="文淵数据管理与审核中心"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                    <p className={`text-xs mt-1 ${stat.warning ? "text-destructive" : "text-muted-foreground"}`}>
                      {stat.sub}
                    </p>
                  </div>
                  <div className={`p-2 rounded-lg ${stat.warning ? "bg-destructive/10" : "bg-primary/10"}`}>
                    <Icon className={`h-5 w-5 ${stat.warning ? "text-destructive" : "text-primary"}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="md:col-span-2">
          <PageSection title="快捷操作">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.title} href={action.href}>
                    <Card className="h-full hover:border-primary/50 hover:shadow-md transition-all cursor-pointer">
                      <CardContent className="pt-6">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="font-medium mb-1">{action.title}</h3>
                        <p className="text-sm text-muted-foreground">{action.description}</p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </PageSection>

          {/* Book List Summary */}
          <PageSection title="书籍概览" className="mt-6" action={
            <Link href="/admin/books">
              <Button variant="ghost" size="sm" className="gap-1">
                查看全部 <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          }>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {books.slice(0, 5).map((book) => (
                    <div key={book.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <Link href={`/admin/books/${book.id}`} className="text-sm font-medium hover:underline">
                            {book.title}
                          </Link>
                          <span className="text-xs text-muted-foreground ml-2">
                            {book.author || "佚名"}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {book.chapterCount}章 / {book.personaCount}人
                      </span>
                    </div>
                  ))}
                  {books.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      暂无书籍，请导入您的第一本书
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </PageSection>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Navigation Cards */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">功能模块</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/admin/books" className="flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors">
                <div className="flex items-center gap-2">
                  <Library className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">书库管理</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link href="/admin/review" className="flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">审核中心</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link href="/admin/model" className="flex items-center justify-between rounded-md p-2 hover:bg-accent transition-colors">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">模型设置</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
