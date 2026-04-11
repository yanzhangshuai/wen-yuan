import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { previewPrompt } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

const PATH = "/api/admin/knowledge/prompt-templates/[slug]/preview";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const { slug } = await context.params;
    const body = await readJsonBody(request) as Record<string, unknown> | null;
    const versionId = typeof body?.versionId === "string" ? body.versionId : undefined;
    const sampleInput = body?.sampleInput && typeof body.sampleInput === "object" ? body.sampleInput as Record<string, string> : undefined;

    const data = await previewPrompt(slug, versionId, sampleInput);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_PROMPT_PREVIEW", message: "预览成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "预览失败" });
  }
}
