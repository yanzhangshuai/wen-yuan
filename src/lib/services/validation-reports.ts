/**
 * @module validation-reports
 * @description 自检报告客户端服务层
 *
 * 封装自检报告审核所需的所有 HTTP 请求，对应后端路由 `/api/books/[id]/validation-reports/*`。
 *
 * 分层定位：
 * - 该文件属于前端服务层，负责“组件调用 -> HTTP 请求”适配；
 * - 不负责 UI 状态管理，也不承载后端业务规则判断。
 *
 * 业务背景：
 * - 质检流程会产出 validation report（摘要 + issues）；
 * - 录入/校对人员可查看详情并对支持自动修复的问题执行批量修正。
 *
 * 与 Next.js 的关系：
 * - 该文件不直接参与 App Router 路由定义；
 * - 但会被 Client Component 调用，驱动页面在 CSR 交互阶段向 route.ts 发起请求。
 */
import { clientFetch } from "@/lib/client-api";
import type { ValidationIssue, ValidationSummary } from "@/types/validation";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

export interface ValidationReportItem {
  /** 报告主键 ID。 */
  id       : string;
  /** 所属书籍 ID。 */
  bookId   : string;
  /** 关联分析任务 ID；离线生成或历史数据可能为空。 */
  jobId    : string | null;
  /** 报告作用域（全书或章节）。 */
  scope    : string;
  /** 章节级报告对应的章节 ID；全书级可为空。 */
  chapterId: string | null;
  /** 报告处理状态（如 PENDING/REVIEWED/APPLIED）。 */
  status   : string;
  /** 报告摘要统计（错误数、警告数、可自动修复数等）。 */
  summary  : ValidationSummary;
  /** 报告生成时间（ISO 字符串）。 */
  createdAt: string;
}

export interface ValidationReportDetail extends ValidationReportItem {
  /** 报告问题明细列表。 */
  issues: ValidationIssue[];
}

/* ------------------------------------------------
   Fetch
   ------------------------------------------------ */

/** 获取指定书籍的自检报告列表。 */
export async function fetchValidationReports(
  bookId: string
): Promise<ValidationReportItem[]> {
  // 读取摘要列表：用于角色资料工作台首屏展示与状态总览。
  return clientFetch<ValidationReportItem[]>(
    `/api/books/${bookId}/validation-reports`
  );
}

/** 获取单个自检报告详情（含 issues 列表）。 */
export async function fetchValidationReportDetail(
  bookId  : string,
  reportId: string
): Promise<ValidationReportDetail> {
  // 按需读取详情，避免列表接口返回过大 payload。
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
  /**
   * 这里直接使用原生 fetch（而非 clientMutate）的设计原因：
   * - 当前返回结构只需读取 `data.appliedCount`；
   * - 逻辑较轻，显式处理 res.ok 可直观表达失败分支。
   */
  const res = await fetch(`/api/books/${bookId}/validation-reports/${reportId}`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    // action 是后端路由约定的命令参数，表示执行“自动修正”动作。
    body   : JSON.stringify({ action: "apply-auto-fixes" })
  });

  // 非 2xx 统一抛错给调用方，交由组件层决定提示方式。
  if (!res.ok) throw new Error("应用自动修正失败");

  // 防御性解析：若后端未返回 appliedCount，默认回退为 0。
  // 这样可避免因后端字段缺失导致前端崩溃，同时让 UI 仍能给出确定反馈。
  const json = await res.json() as { data?: { appliedCount?: number } };
  return { appliedCount: json.data?.appliedCount ?? 0 };
}
