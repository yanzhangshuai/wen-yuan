"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { PageContainer, PageHeader, PageSection } from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  fetchNerLexiconRules,
  type NerLexiconRuleItem,
  type NerLexiconRuleType
} from "@/lib/services/ner-rules";
import { NerRuleForm } from "../../_components/ner-rule-form";

const RULE_TYPES: NerLexiconRuleType[] = ["HARD_BLOCK_SUFFIX", "SOFT_BLOCK_SUFFIX", "TITLE_STEM", "POSITION_STEM"];

async function findRuleById(id: string): Promise<NerLexiconRuleItem | null> {
  for (const ruleType of RULE_TYPES) {
    const rules = await fetchNerLexiconRules({ ruleType });
    const found = rules.find((rule) => rule.id === id);
    if (found) return found;
  }
  return null;
}

export default function EditNerRulePage() {
  const params = useParams<{ id: string }>();
  const id     = params?.id ?? "";
  const { toast } = useToast();
  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [item,      setItem]      = useState<NerLexiconRuleItem | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchBookTypes({ active: true }), findRuleById(id)])
      .then(([types, found]) => {
        if (cancelled) return;
        setBookTypes(types);
        if (!found) setError("未找到该词典规则");
        else setItem(found);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast({ title: "加载失败", description: message, variant: "destructive" });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, toast]);

  return (
    <PageContainer>
      <PageHeader
        title="编辑 NER 词典规则"
        description={item ? `${item.content.slice(0, 60)}` : "加载中..."}
        breadcrumbs={[
          { label: "管理后台",      href: "/admin" },
          { label: "知识库",        href: "/admin/knowledge-base" },
          { label: "NER 词典规则", href: "/admin/knowledge-base/ner-rules" },
          { label: "编辑" }
        ]}
      />
      <PageSection>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : error ? (
          <div className="py-12 text-center text-destructive">{error}</div>
        ) : item ? (
          <NerRuleForm
            initial={item}
            ruleType={item.ruleType}
            bookTypes={bookTypes}
            redirectTo="/admin/knowledge-base/ner-rules"
          />
        ) : null}
      </PageSection>
    </PageContainer>
  );
}
