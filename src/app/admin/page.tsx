import Link from "next/link";
import {
  type LucideIcon,
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

/**
 * 文件定位（Next.js App Router 页面入口）：
 * - 文件路径：`src/app/admin/page.tsx`
 * - 路由语义：`/admin`
 * - 文件类型：`page.tsx`，由 Next.js 作为管理后台首页渲染入口。
 *
 * 核心业务职责：
 * 1) 聚合后台首页运营概览数据（书籍总数、人物总数、待处理数量）；
 * 2) 提供高频入口（导入、审核、模型设置）；
 * 3) 展示最近书籍摘要，帮助管理员快速进入具体书籍管理页。
 *
 * 渲染与运行语义：
 * - 未声明 `"use client"`，因此该页面是 Server Component；
 * - 数据在服务端通过 `listBooks()` 预取，首屏即可输出完整摘要；
 * - 交互以导航为主，无需在本页维护客户端状态。
 *
 * 上下游关系：
 * - 上游：`admin/layout.tsx` 已完成权限门禁，本页可默认运行在管理员上下文；
 * - 下游：通过链接分发到 `/admin/books/import`、`/admin/review`、`/admin/model`、`/admin/books/[id]`。
 *
 * 维护注意：
 * - 首页统计口径属于运营看板规则，不建议随意改动计算逻辑；
 * - “关系总数”当前展示占位文案，后续若接入真实统计需与后端聚合口径对齐。
 */

/**
 * 快捷操作项定义。
 */
interface QuickActionItem {
  /** 卡片标题，表示该入口的业务动作名称。 */
  title      : string;
  /** 卡片描述，说明入口背后的具体业务意图。 */
  description: string;
  /** 图标组件，用于快速建立视觉识别。 */
  icon       : LucideIcon;
  /** 点击后的目标路由。 */
  href       : string;
}

/**
 * 首页统计卡片定义。
 */
interface StatItem {
  /** 指标名称。 */
  label   : string;
  /** 指标值（字符串形式，便于直接渲染）。 */
  value   : string;
  /** 对应图标。 */
  icon    : LucideIcon;
  /** 次级说明文本（如“已完成/需处理”）。 */
  sub     : string;
  /**
   * 是否告警态。
   * - true：展示风险颜色，提醒管理员优先处理；
   * - false/undefined：常规信息展示。
   */
  warning?: boolean;
}

/**
 * 后台首页快捷入口。
 *
 * 这是业务流程主干入口清单，不建议轻易改顺序或删除：
 * - 导入 -> 审核 -> 模型配置，代表后台日常运营的核心闭环。
 */
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
] as const satisfies readonly QuickActionItem[];

/**
 * 管理后台首页（Server Component）。
 *
 * @returns 后台首页 JSX
 */
export default async function AdminHomePage() {
  // 首屏核心数据：后台首页所有统计与书籍摘要都基于此列表计算。
  const books = await listBooks();

  // 统计指标计算：
  // 这些口径服务于首页看板，不直接参与后端业务写操作。
  const totalBooks = books.length;
  // “已完成”定义：状态为 COMPLETED 的书籍数量。
  const completedBooks = books.filter(b => b.status === "COMPLETED").length;
  // 人物总数允许缺省：`personaCount` 为空时按 0 处理，避免聚合出现 NaN。
  const totalPersonas = books.reduce((acc, b) => acc + (b.personaCount ?? 0), 0);
  // “待处理”口径：PENDING（待启动）+ PROCESSING（处理中）都算未完成工作量。
  const pendingBooks = books.filter(b => b.status === "PENDING" || b.status === "PROCESSING").length;

  const stats: StatItem[] = [
    { label: "书籍总数", value: String(totalBooks), icon: BookOpen, sub: `${completedBooks} 已完成` },
    { label: "人物总数", value: totalPersonas.toLocaleString(), icon: Users, sub: "已解析" },
    // 当前版本暂未接入关系总量聚合接口，因此先展示占位符，避免误导为 0。
    { label: "关系总数", value: "—", icon: GitBranch, sub: "统计中" },
    // 业务规则：当存在待处理书籍时，应以 warning 视觉强调，提示管理员尽快处理。
    { label: "待处理", value: String(pendingBooks), icon: ClipboardCheck, sub: "需处理", warning: pendingBooks > 0 }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="管理后台"
        description="文淵数据管理与审核中心"
      />

      {/*
        统计看板区：
        - 通过 `warning` 动态切换颜色层级，突出待处理风险；
        - 卡片结构统一，便于后续扩展更多指标。
      */}
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
        {/* 左侧主区：快捷操作 + 书籍概览。 */}
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

          {/*
            书籍概览：
            - 仅展示前 5 条，定位是“快速入口”而非完整管理；
            - 完整列表通过右上角“查看全部”进入专门页面。
          */}
          <PageSection title="书籍概览" className="mt-6" action={(
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link href="/admin/books">
                查看全部 <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          )}>
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
                    // 空态分支：首次部署或尚未导入时给出明确下一步指引。
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      暂无书籍，请导入您的第一本书
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </PageSection>
        </div>

        {/* 右侧边栏：模块级导航，帮助管理员快速切换后台域功能。 */}
        <div className="space-y-6">
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
