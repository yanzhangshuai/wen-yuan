/**
 * @module validation-reports
 * @description 自检报告客户端服务层
 *
 * 封装自检报告审核所需的所有 HTTP 请求，对应后端路由 `/api/books/[id]/validation-reports/*`。
 */
import { clientFetch } from "@/lib/client-api";
import type { ValidationIssue, ValidationSummary } from "@/types/validation";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

export interface ValidationReportItem {
  id       : string;
  bookId   : string;
  jobId    : string | null;
  scope    : string;
  chapterId: string | null;
  status   : string;
  summary  : ValidationSummary;
  createdAt: string;
}

export interface ValidationReportDetail extends ValidationReportItem {
  issues: ValidationIssue[];
}

/* ------------------------------------------------
   Fetch
   ------------------------------------------------ */

/** 获取指定书籍的自检报告列表。 */
export async function fetchValidationReports(
  bookId: string
): Promise<ValidationReportItem[]> {
  return clientFetch<ValidationReportItem[]>(
    `/api/books/${bookId}/validation-reports`
  );
}

/** 获取单个自检报告详情（含 issues 列表）。 */
export async function fetchValidationReportDetail(
  bookId  : string,
  reportId: string
): Promise<ValidationReportDetail> {
  return clientFetch<ValidationReportDetail>(
    `/api/books/${bookId}/validation-reports/${reportId}`
  );
}

/* ------------------------------------------------
   Mutations
   ------------------------------------------------ */

/** 对指定报告执行自动修正，返回修正条数。 */
export async function applyAutoFixes(
  bookId  : string,
  reportId: string
): Promise<{ appliedCount: number }> {
  const res = await fetch(`/api/books/${bookId}/validation-reports/${reportId}`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ action: "apply-auto-fixes" })
  });
  if (!res.ok) throw new Error("应用自动修正失败");
  const json = await res.json() as { data?: { appliedCount?: number } };
  return { appliedCount: json.data?.appliedCount ?? 0 };
}
