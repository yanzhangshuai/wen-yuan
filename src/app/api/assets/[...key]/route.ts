import { readFile } from "node:fs/promises";

import {
  inferContentTypeFromKey,
  normalizeStorageKey,
  resolveLocalStorageFilePath
} from "@/server/providers/storage/storage.utils";

/**
 * 文件定位（Next.js Route Handler）：
 * - 路由文件：`app/api/assets/[...key]/route.ts`，会被 Next.js 识别为 catch-all 接口路由。
 * - 对应访问路径：`GET /api/assets/**`，`[...key]` 捕获任意层级子路径。
 *
 * 业务职责：
 * - 将本地对象存储（或本地文件）通过应用内 URL 暴露给前端访问。
 * - 统一补充基础 `Content-Type` 与缓存头，避免静态资源以错误 MIME 返回。
 *
 * 运行环境：
 * - 仅在服务端执行（Node.js），因为涉及文件系统读取。
 *
 * 功能：通过应用内 URL 提供本地静态资源访问。
 * 输入：动态路由参数 key。
 * 输出：文件二进制响应，附带基础 Content-Type 和缓存头。
 * 异常：文件不存在时返回 404，非法 key 返回 400，其它异常返回 500。
 * 副作用：读取本地文件系统。
 *
 * 安全边界说明：
 * - `normalizeStorageKey` + `resolveLocalStorageFilePath` 的组合用于防止目录穿越；
 * - 这是文件访问安全规则，不是可选优化，不能随意移除。
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> }
): Promise<Response> {
  try {
    // Step 1) 读取 catch-all 动态段。
    // Next.js 中 `[...key]` 会把路径切成数组，例如 `/api/assets/a/b.png` -> ["a","b.png"]。
    const { key } = await context.params;

    // Step 2) 归一化存储 key：
    // - 把数组拼接为统一 key；
    // - 标准化并过滤非法片段，防止 `../` 等目录穿越输入。
    const normalizedKey = normalizeStorageKey(key.join("/"));

    // Step 3) 解析到本地物理路径并读取文件内容。
    const filePath = resolveLocalStorageFilePath(normalizedKey);
    const fileBuffer = await readFile(filePath);

    // Step 4) 原样返回二进制内容，配套 MIME 和缓存头。
    return new Response(fileBuffer, {
      status : 200,
      headers: {
        // MIME 推断用于浏览器正确渲染（图片/文本/二进制下载）。
        "Content-Type" : inferContentTypeFromKey(normalizedKey),
        // 轻量缓存：1 分钟，兼顾资源更新可见性和重复请求性能。
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (error) {
    // 分支 1：key 非法 -> 400。
    // 业务语义：客户端请求格式错误，不是资源缺失也不是服务端故障。
    if (
      error instanceof Error &&
      error.message.startsWith("Invalid storage object key:")
    ) {
      return new Response("Bad Request", { status: 400 });
    }

    // 分支 2：文件不存在 -> 404。
    // 业务语义：路径合法，但目标资源缺失。
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return new Response("Not Found", { status: 404 });
    }

    // 分支 3：未知异常 -> 500。
    // 防御目的：不向调用方泄露内部文件系统细节与堆栈信息。
    return new Response("Internal Server Error", { status: 500 });
  }
}
