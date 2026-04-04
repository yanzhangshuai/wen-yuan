import type { Metadata } from "next";

import { listAdminModels } from "@/server/modules/models";
import { ModelManager } from "./_components/model-manager";
import {
  PageContainer,
  PageHeader
} from "@/components/layout/page-header";

export const metadata: Metadata = { title: "模型设置" };

export default async function AdminModelPage() {
  const initialModels = await listAdminModels();
  return (
    <PageContainer>
      <PageHeader
        title="模型设置"
        description="配置 AI 模型、API 密钥与系统偏好"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "模型设置" }
        ]}
      />
      <ModelManager initialModels={initialModels} />
    </PageContainer>
  );
}
