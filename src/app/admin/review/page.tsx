import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "审核中心"
};

export default function AdminReviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--color-fg)]">审核中心</h1>
        <p className="text-[var(--color-muted-fg)] mt-1">审核 AI 识别的人物、关系与传记事件</p>
      </div>

      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <div className="mb-6 p-4 rounded-full bg-[var(--color-primary)]/10">
          <ClipboardCheck className="w-10 h-10 text-[var(--color-primary)]" />
        </div>
        <h2 className="text-xl font-semibold text-[var(--color-fg)] mb-2">
          请先选择一本书籍
        </h2>
        <p className="text-[var(--color-muted-fg)] max-w-md">
          审核面板将在选择书籍后展示人物草稿、关系草稿、传记事件和合并建议。
        </p>
      </div>
    </div>
  );
}
