import Link from "next/link";
import { FileClock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";

/**
 * `/admin/knowledge-base` 知识库管理总览。
 *
 * 知识库仅保留变更日志审计入口；技能包管理在 `/admin/skills`。
 */
const knowledgeModules = [
  {
    href       : "/admin/knowledge-base/change-logs",
    title      : "变更日志",
    description: "审计技能包等对象的创建、修改、激活与启停记录。",
    icon       : FileClock
  }
] as const;

/**
 * 知识库管理总览页。
 */
export default function KnowledgeBasePage() {
  return (
    <PageContainer>
      <PageHeader
        title="知识库管理"
        description="技能包（Skill）启停与契约见「技能管理」；此处保留变更日志审计。"
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
