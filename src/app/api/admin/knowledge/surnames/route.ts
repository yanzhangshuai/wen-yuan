import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listSurnames, createSurname } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, createSurnameSchema } from "../_shared";

const PATH = "/api/admin/knowledge/surnames";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const compound = url.searchParams.get("compound");
    const q = url.searchParams.get("q") ?? undefined;

    const data = await listSurnames({
      compound: compound === "true" ? true : compound === "false" ? false : undefined,
      q
    });

    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_SURNAMES_LISTED", message: "姓氏列表获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "姓氏列表获取失败" });
  }
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = createSurnameSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(PATH, requestId, startedAt, parsed.error.issues[0]?.message ?? "参数不合法");
    }

    const data = await createSurname(parsed.data);
    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_SURNAME_CREATED", message: "姓氏创建成功", data, status: 201 });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "姓氏创建失败" });
  }
}
