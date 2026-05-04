import { PageContainer, PageHeader, PageSection } from "@/components/layout/page-header";

import { HistoricalFigureImportForm } from "../_components/historical-figure-import-form";

export default function ImportHistoricalFiguresPage() {
  return (
    <PageContainer>
      <PageHeader
        title="批量导入历史人物"
        description="按模板粘贴文本批量导入"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "历史人物", href: "/admin/knowledge-base/historical-figures" },
          { label: "批量导入" }
        ]}
      />
      <PageSection>
        <HistoricalFigureImportForm />
      </PageSection>
    </PageContainer>
  );
}
