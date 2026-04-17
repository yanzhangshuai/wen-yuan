import type { Metadata } from "next";

import {
  KnowledgeBaseNav,
  type KnowledgeBaseNavLink
} from "@/app/admin/knowledge-base/knowledge-base-nav";

export const metadata: Metadata = {
  title: "知识库管理"
};

const knowledgeBaseLinks = [
  {
    href   : "/admin/knowledge-base",
    label  : "总览",
    iconKey: "overview"
  },
  {
    href   : "/admin/knowledge-base/book-types",
    label  : "书籍类型",
    iconKey: "book-type"
  },
  {
    href   : "/admin/knowledge-base/alias-packs",
    label  : "别名知识包",
    iconKey: "alias-pack"
  },
  {
    href   : "/admin/knowledge-base/surnames",
    label  : "姓氏词库",
    iconKey: "surname"
  },
  {
    href   : "/admin/knowledge-base/title-filters",
    label  : "泛化称谓",
    iconKey: "title-filter"
  },
  {
    href   : "/admin/knowledge-base/prompt-templates",
    label  : "提示词模板",
    iconKey: "prompt-template"
  },
  {
    href   : "/admin/knowledge-base/ner-rules",
    label  : "NER 词典规则",
    iconKey: "ner-rule"
  },
  {
    href   : "/admin/knowledge-base/prompt-extraction-rules",
    label  : "Prompt 提取规则",
    iconKey: "prompt-extraction-rule"
  },
  
  {
    href   : "/admin/knowledge-base/historical-figures",
    label  : "历史人物",
    iconKey: "historical-figure"
  },
  {
    href   : "/admin/knowledge-base/name-patterns",
    label  : "名字模式规则",
    iconKey: "name-pattern"
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
