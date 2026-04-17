import Link from "next/link";
import { BookMarked, BookOpenText, FileClock, Filter, History, Regex, ScrollText, Sparkles, UserRoundSearch } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";

const knowledgeModules = [
  {
    href       : "/admin/knowledge-base/book-types",
    title      : "书籍类型",
    description: "维护书籍类型与 NER 调谐配置。",
    icon       : BookOpenText
  },
  {
    href       : "/admin/knowledge-base/alias-packs",
    title      : "别名知识包",
    description: "管理人物标准名、别名与 AI 生成导入。",
    icon       : Sparkles
  },
  {
    href       : "/admin/knowledge-base/surnames",
    title      : "姓氏词库",
    description: "维护单姓/复姓识别所需的运行时词表。",
    icon       : UserRoundSearch
  },
  {
    href       : "/admin/knowledge-base/title-filters",
    title      : "泛化称谓",
    description: "配置安全泛称、默认泛称及书籍类型豁免。",
    icon       : Filter
  },
  {
    href       : "/admin/knowledge-base/prompt-templates",
    title      : "提示词模板",
    description: "查看版本、激活模板并预览渲染结果。",
    icon       : ScrollText
  },
  {
    href       : "/admin/knowledge-base/ner-rules",
    title      : "NER 词典规则",
    description: "维护命名实体识别的词典规则（后缀阻断、词干）。",
    icon       : BookMarked
  },
  {
    href       : "/admin/knowledge-base/prompt-extraction-rules",
    title      : "Prompt 提取规则",
    description: "维护实体/关系抽取时拼接进 Prompt 的规则列表。",
    icon       : ScrollText
  },
  {
    href       : "/admin/knowledge-base/change-logs",
    title      : "变更日志",
    description: "审计知识库对象的创建、修改、激活与导入。",
    icon       : FileClock
  },
  {
    href       : "/admin/knowledge-base/historical-figures",
    title      : "历史人物",
    description: "维护史书展现的历史名人登记，防止 AI 把已知历史人物错误分裂或审频截断。",
    icon       : History
  },
  {
    href       : "/admin/knowledge-base/name-patterns",
    title      : "名字模式规则",
    description: "维护正则模式规则，阻断家族后缀、描述性短语等被错识为人名。",
    icon       : Regex
  }
] as const;

/**
 * `/admin/knowledge-base` 知识库管理总览。
 */
export default function KnowledgeBasePage() {
  return (
    <PageContainer>
      <PageHeader
        title="知识库管理"
        description="集中维护解析运行时依赖的知识数据、规则与模板。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库" }
        ]}
      />

      <PageSection>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {knowledgeModules.map((module) => {
            const Icon = module.icon;
            return (
              <Link key={module.href} href={module.href}>
                <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
                  <CardHeader className="pb-3">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base">{module.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {module.description}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </PageSection>
    </PageContainer>
  );
}
