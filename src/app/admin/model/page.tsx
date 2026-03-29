import { Suspense } from "react";
import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listAdminModels } from "@/server/modules/models";
import { ModelManager } from "./_components/model-manager";
import {
  PageContainer,
  PageHeader
} from "@/components/layout/page-header";

export const metadata: Metadata = { title: "模型设置" };

function ModelLoadingSkeleton() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="py-8">
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export default function AdminModelPage() {
  const modelsPromise = listAdminModels();
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
      <Suspense fallback={<ModelLoadingSkeleton />}>
        <ModelManager initialModelsPromise={modelsPromise} />
      </Suspense>
    </PageContainer>
  );
}
