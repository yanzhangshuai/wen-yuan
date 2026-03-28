import { Suspense } from "react";
import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listAdminModels } from "@/server/modules/models";
import { ModelManager } from "./_components/model-manager";

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
    <Suspense fallback={<ModelLoadingSkeleton />}>
      <ModelManager initialModelsPromise={modelsPromise} />
    </Suspense>
  );
}
