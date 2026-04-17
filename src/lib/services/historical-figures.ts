import { clientFetch, clientMutate } from "@/lib/client-api";

export type HistoricalFigureCategory =
  | "EMPEROR"
  | "SAGE"
  | "POET"
  | "GENERAL"
  | "MYTHICAL"
  | "STATESMAN";

export type ReviewStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface HistoricalFigureItem {
  id          : string;
  name        : string;
  aliases     : string[];
  dynasty     : string | null;
  category    : HistoricalFigureCategory;
  description : string | null;
  source      : string;
  reviewStatus: ReviewStatus;
  reviewNote  : string | null;
  reviewedAt  : string | null;
  isActive    : boolean;
  createdAt   : string;
  updatedAt   : string;
}

export interface HistoricalFigureListResult {
  data      : HistoricalFigureItem[];
  pagination: {
    page    : number;
    pageSize: number;
    total   : number;
  };
}

export interface HistoricalFigureImportResult {
  imported: number;
  total   : number;
}

export const HISTORICAL_FIGURE_CATEGORIES: Array<{ value: HistoricalFigureCategory; label: string }> = [
  { value: "EMPEROR",   label: "帝王" },
  { value: "SAGE",      label: "圣贤" },
  { value: "POET",      label: "诗人" },
  { value: "GENERAL",   label: "武将" },
  { value: "MYTHICAL",  label: "神话人物" },
  { value: "STATESMAN", label: "政治家" }
];

export function getHistoricalFigureCategoryLabel(category: string): string {
  return HISTORICAL_FIGURE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export async function fetchHistoricalFigures(params?: {
  q?       : string;
  category?: HistoricalFigureCategory;
  dynasty? : string;
  page?    : number;
  pageSize?: number;
}): Promise<HistoricalFigureItem[]> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.category) sp.set("category", params.category);
  if (params?.dynasty) sp.set("dynasty", params.dynasty);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<HistoricalFigureItem[]>(
    `/api/admin/knowledge/historical-figures${qs}`
  );
}

export async function createHistoricalFigure(data: {
  name        : string;
  aliases?    : string[];
  dynasty?    : string;
  category    : HistoricalFigureCategory;
  description?: string;
  isActive?   : boolean;
}): Promise<HistoricalFigureItem> {
  return clientFetch<HistoricalFigureItem>("/api/admin/knowledge/historical-figures", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateHistoricalFigure(
  id  : string,
  data: {
    name?        : string;
    aliases?     : string[];
    dynasty?     : string | null;
    category?    : HistoricalFigureCategory;
    description? : string | null;
    reviewStatus?: ReviewStatus;
    isActive?    : boolean;
  }
): Promise<void> {
  await clientMutate(`/api/admin/knowledge/historical-figures/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteHistoricalFigure(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/historical-figures/${id}`, {
    method: "DELETE"
  });
}

export async function importHistoricalFigures(
  entries: Array<{
    name        : string;
    aliases?    : string[];
    dynasty?    : string;
    category    : HistoricalFigureCategory;
    description?: string;
  }>
): Promise<HistoricalFigureImportResult> {
  return clientFetch<HistoricalFigureImportResult>(
    "/api/admin/knowledge/historical-figures/import",
    {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ entries })
    }
  );
}
