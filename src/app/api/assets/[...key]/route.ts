import { readFile } from "node:fs/promises";

import {
  inferContentTypeFromKey,
  normalizeStorageKey,
  resolveLocalStorageFilePath
} from "@/server/providers/storage/storage.utils";

/**
 * 功能：通过应用内 URL 提供本地静态资源访问。
 * 输入：动态路由参数 key。
 * 输出：文件二进制响应，附带基础 Content-Type 和缓存头。
 * 异常：文件不存在时返回 404，非法 key 返回 400，其它异常返回 500。
 * 副作用：读取本地文件系统。
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> }
): Promise<Response> {
  try {
    const { key } = await context.params;
    const normalizedKey = normalizeStorageKey(key.join("/"));
    const filePath = resolveLocalStorageFilePath(normalizedKey);
    const fileBuffer = await readFile(filePath);

    return new Response(fileBuffer, {
      status : 200,
      headers: {
        "Content-Type" : inferContentTypeFromKey(normalizedKey),
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Invalid storage object key:")
    ) {
      return new Response("Bad Request", { status: 400 });
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}
