import type { Metadata } from "next";

import {
  KnowledgeBaseNav,
  type KnowledgeBaseNavLink
} from "@/app/admin/knowledge-base/knowledge-base-nav";

export const metadata: Metadata = {
  title: "知识库管理"
};

/**
 * v5（阶段 5）：v4 知识库页面已删，只保留总览与变更日志；
 * 技能管理入口独立为 /admin/skills（见 admin-header）。
 */
const knowledgeBaseLinks = [
  {
    href   : "/admin/knowledge-base",
    label  : "总览",
    iconKey: "overview"
  },
  {
    href   : "/admin/knowledge-base/change-logs",
    label  : "变更日志",
    iconKey: "change-log"
  }
] as const satisfies ReadonlyArray<KnowledgeBaseNavLink>;

/**
 * 知识库管理区域布局。
 * 提供子页面通用侧边导航。
 */
export default function KnowledgeBaseLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)]">
      <aside className="hidden w-56 shrink-0 border-r bg-muted/30 p-4 md:block">
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">知识库管理</h3>
        <KnowledgeBaseNav links={knowledgeBaseLinks} />
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
