"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { PageContainer, PageHeader, PageSection } from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import { fetchPromptExtractionRules, type PromptExtractionRuleItem } from "@/lib/services/prompt-extraction-rules";
import { PromptExtractionRuleForm } from "../../_components/prompt-extraction-rule-form";

export default function EditPromptExtractionRulePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [item, setItem]           = useState<PromptExtractionRuleItem | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [entityRules, relationshipRules, types] = await Promise.all([
          fetchPromptExtractionRules({ ruleType: "ENTITY" }),
          fetchPromptExtractionRules({ ruleType: "RELATIONSHIP" }),
          fetchBookTypes({ active: true })
        ]);
        if (cancelled) return;
        const found = [...entityRules, ...relationshipRules].find((it) => it.id === params.id);
        if (!found) {
          toast({ title: "Prompt 规则不存在", variant: "destructive" });
          router.replace("/admin/knowledge-base/prompt-extraction-rules");
          return;
        }
        setItem(found);
        setBookTypes(types);
      } catch (error) {
        toast({ title: "加载失败", description: String(error), variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params.id, router, toast]);

  return (
    <PageContainer>
      <PageHeader
        title="编辑 Prompt 规则"
        description="维护实体和关系抽取时拼接进 Prompt 的规则。"
        breadcrumbs={[
          { label: "管理后台",         href: "/admin" },
          { label: "知识库",           href: "/admin/knowledge-base" },
          { label: "Prompt 提取规则", href: "/admin/knowledge-base/prompt-extraction-rules" },
          { label: "编辑" }
        ]}
      />
      <PageSection>
        {loading ? (
          <div className="text-muted-foreground">加载中...</div>
        ) : item ? (
          <PromptExtractionRuleForm
            initial={item}
            defaultRuleType={item.ruleType}
            bookTypes={bookTypes}
            redirectTo="/admin/knowledge-base/prompt-extraction-rules"
          />
        ) : null}
      </PageSection>
    </PageContainer>
  );
}
