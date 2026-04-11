import { clientFetch, clientMutate } from "@/lib/client-api";

export interface PromptTemplateVersionItem {
  id          : string;
  versionNo   : number;
  systemPrompt: string;
  userPrompt  : string;
  genreKey    : string | null;
  changeNote  : string | null;
  createdBy   : string | null;
  isBaseline  : boolean;
  createdAt   : string;
}

export interface PromptTemplateItem {
  id             : string;
  slug           : string;
  name           : string;
  description    : string | null;
  codeRef        : string | null;
  isActive       : boolean;
  activeVersionId: string | null;
  createdAt      : string;
  updatedAt      : string;
  versions?      : PromptTemplateVersionItem[];
}

export interface PromptTemplateListItem {
  id             : string;
  slug           : string;
  name           : string;
  description    : string | null;
  codeRef        : string | null;
  isActive       : boolean;
  activeVersionId: string | null;
  createdAt      : string;
  updatedAt      : string;
  versions       : Array<Pick<PromptTemplateVersionItem, "id" | "versionNo" | "createdAt" | "changeNote">>;
}

export interface PromptDiffResult {
  v1: {
    id          : string;
    versionNo   : number;
    systemPrompt: string;
    userPrompt  : string;
  };
  v2: {
    id          : string;
    versionNo   : number;
    systemPrompt: string;
    userPrompt  : string;
  };
}

export interface PromptPreviewResult {
  systemPrompt: string;
  userPrompt  : string;
  versionNo?  : number;
  codeRef?    : string | null;
}

export async function fetchPromptTemplates(): Promise<PromptTemplateListItem[]> {
  return clientFetch<PromptTemplateListItem[]>("/api/admin/knowledge/prompt-templates");
}

export async function fetchPromptTemplate(slug: string): Promise<PromptTemplateItem> {
  return clientFetch<PromptTemplateItem>(`/api/admin/knowledge/prompt-templates/${slug}`);
}

export async function createPromptVersion(slug: string, data: {
  systemPrompt: string;
  userPrompt  : string;
  genreKey?   : string;
  changeNote? : string;
  isBaseline? : boolean;
}): Promise<PromptTemplateVersionItem> {
  return clientFetch<PromptTemplateVersionItem>(`/api/admin/knowledge/prompt-templates/${slug}/versions`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function activatePromptVersion(slug: string, versionId: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/prompt-templates/${slug}/activate/${versionId}`, {
    method: "POST"
  });
}

export async function diffPromptVersions(slug: string, fromVersionId: string, toVersionId: string): Promise<PromptDiffResult> {
  const sp = new URLSearchParams({ v1: fromVersionId, v2: toVersionId });
  return clientFetch<PromptDiffResult>(`/api/admin/knowledge/prompt-templates/${slug}/diff?${sp.toString()}`);
}

export async function previewPrompt(slug: string, data?: {
  versionId?  : string;
  sampleInput?: Record<string, string>;
}): Promise<PromptPreviewResult> {
  return clientFetch<PromptPreviewResult>(`/api/admin/knowledge/prompt-templates/${slug}/preview`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data ?? {})
  });
}
