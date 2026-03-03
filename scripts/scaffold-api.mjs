#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

/**
 * 功能：从命令行参数读取脚手架配置。
 * 输入：process.argv。
 * 输出：name、method、force 选项。
 * 异常：参数非法时抛错并退出。
 * 副作用：无。
 */
function parseArgs(argv) {
  const args = {
    name: "",
    method: "POST",
    force: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--name") {
      args.name = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if (token === "--method") {
      args.method = (argv[i + 1] ?? "POST").toUpperCase();
      i += 1;
      continue;
    }

    if (token === "--force") {
      args.force = true;
      continue;
    }
  }

  if (!args.name) {
    throw new Error("Missing required argument: --name <api-path>");
  }

  if (!/^[a-z0-9\-/]+$/.test(args.name)) {
    throw new Error("--name only supports lowercase letters, numbers, '-', '/'");
  }

  if (!/^[A-Z]+$/.test(args.method)) {
    throw new Error("--method must be an HTTP method like POST/GET/PUT/DELETE");
  }

  return args;
}

/**
 * 功能：将 kebab/segment 字符串转为 camelCase。
 * 输入：text。
 * 输出：camelCase 字符串。
 * 异常：无。
 * 副作用：无。
 */
function toCamelCase(text) {
  return text
    .split(/[\/-]/)
    .filter(Boolean)
    .map((chunk, index) => {
      if (index === 0) {
        return chunk;
      }

      return chunk.charAt(0).toUpperCase() + chunk.slice(1);
    })
    .join("");
}

/**
 * 功能：将 kebab/segment 字符串转为 PascalCase。
 * 输入：text。
 * 输出：PascalCase 字符串。
 * 异常：无。
 * 副作用：无。
 */
function toPascalCase(text) {
  return text
    .split(/[\/-]/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join("");
}

/**
 * 功能：保证目录存在。
 * 输入：dirPath。
 * 输出：无。
 * 异常：创建目录失败时抛错。
 * 副作用：写入文件系统。
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * 功能：按规则写入文件（可选覆盖）。
 * 输入：filePath、content、force。
 * 输出：无。
 * 异常：文件存在且未开启 force 时抛错。
 * 副作用：写入文件系统。
 */
function writeFileSafely(filePath, content, force) {
  if (fs.existsSync(filePath) && !force) {
    throw new Error(`File already exists: ${filePath} (use --force to overwrite)`);
  }

  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * 功能：生成统一返回标准的 API Route 模板。
 * 输入：apiPath、method、pascalName。
 * 输出：route.ts 文件内容。
 * 异常：无。
 * 副作用：无。
 */
function buildRouteTemplate(apiPath, method, pascalName) {
  const methodName = method.toUpperCase();
  const payloadName = `${pascalName}Request`;
  const resultName = `${pascalName}Response`;

  return `import { createApiMeta, errorResponse, successResponse, toNextJson } from "@/server/http/api-response";
import type { ApiResponse } from "@/types/api";

/**
 * 功能：定义 ${apiPath} 接口请求体。
 * 输入：无。
 * 输出：类型约束 ${payloadName}。
 * 异常：无。
 * 副作用：无。
 */
interface ${payloadName} {
  // TODO: 按业务补充请求字段
  id: string;
}

/**
 * 功能：定义 ${apiPath} 接口返回 data。
 * 输入：无。
 * 输出：类型约束 ${resultName}。
 * 异常：无。
 * 副作用：无。
 */
interface ${resultName} {
  // TODO: 按业务补充返回字段
  ok: true;
}

/**
 * 功能：${methodName} ${apiPath} 接口处理函数。
 * 输入：Request。
 * 输出：统一 ApiResponse<${resultName}> JSON。
 * 异常：内部捕获异常并返回失败响应。
 * 副作用：可触发数据库写入或外部调用（按业务实现）。
 */
export async function ${methodName}(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const getMeta = () => createApiMeta("${apiPath}", requestId, startedAt);

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return toNextJson(
      errorResponse(
        "BAD_JSON",
        "请求体不是合法 JSON",
        { type: "ValidationError", detail: "Request body must be valid JSON" },
        getMeta()
      ),
      400
    );
  }

  try {
    const payload = body as Partial<${payloadName}>;

    if (!payload.id || typeof payload.id !== "string") {
      return toNextJson(
        errorResponse(
          "MISSING_ID",
          "缺少必填字段 id",
          { type: "ValidationError", detail: "id is required" },
          getMeta()
        ),
        400
      );
    }

    // TODO: 在这里实现业务逻辑
    const data: ${resultName} = { ok: true };
    const result: ApiResponse<${resultName}> = successResponse(
      "${pascalName.toUpperCase()}_OK",
      "请求成功",
      data,
      getMeta()
    );

    return toNextJson(result, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return toNextJson(
      errorResponse(
        "${pascalName.toUpperCase()}_FAILED",
        "请求失败",
        { type: "InternalError", detail: message },
        getMeta()
      ),
      500
    );
  }
}
`;
}

/**
 * 功能：生成统一返回标准的 Server Action 模板。
 * 输入：actionName、apiPath、pascalName。
 * 输出：action 文件内容。
 * 异常：无。
 * 副作用：无。
 */
function buildActionTemplate(actionName, apiPath, pascalName) {
  const requestName = `${pascalName}ActionRequest`;
  const responseName = `${pascalName}ActionResponse`;

  return `"use server";

import { createApiMeta, errorResponse, successResponse } from "@/server/http/api-response";
import type { ApiResponse } from "@/types/api";

/**
 * 功能：定义 ${actionName} 入参。
 * 输入：无。
 * 输出：类型约束 ${requestName}。
 * 异常：无。
 * 副作用：无。
 */
export interface ${requestName} {
  // TODO: 按业务补充字段
  id: string;
}

/**
 * 功能：定义 ${actionName} 返回 data。
 * 输入：无。
 * 输出：类型约束 ${responseName}。
 * 异常：无。
 * 副作用：无。
 */
export interface ${responseName} {
  // TODO: 按业务补充字段
  ok: true;
}

/**
 * 功能：执行 ${actionName}，返回统一响应结构。
 * 输入：input - Action 入参。
 * 输出：ApiResponse<${responseName}>。
 * 异常：无（内部转换为失败响应）。
 * 副作用：可触发数据库写入或外部调用（按业务实现）。
 */
export async function ${actionName}(input: ${requestName}): Promise<ApiResponse<${responseName}>> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const getMeta = () => createApiMeta("server-action:${apiPath}", requestId, startedAt);

  if (!input?.id || typeof input.id !== "string") {
    return errorResponse(
      "MISSING_ID",
      "缺少必填字段 id",
      { type: "ValidationError", detail: "id is required" },
      getMeta()
    );
  }

  try {
    // TODO: 在这里实现业务逻辑
    const data: ${responseName} = { ok: true };
    return successResponse("${pascalName.toUpperCase()}_OK", "请求成功", data, getMeta());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(
      "${pascalName.toUpperCase()}_FAILED",
      "请求失败",
      { type: "InternalError", detail: message },
      getMeta()
    );
  }
}
`;
}

/**
 * 功能：程序入口，生成 route/action 脚手架文件。
 * 输入：CLI 参数。
 * 输出：无。
 * 异常：参数或文件写入错误时以非 0 退出。
 * 副作用：创建/覆盖 src/app/api 与 src/server/actions 下文件。
 */
function main() {
  const args = parseArgs(process.argv);
  const normalizedPath = args.name.replace(/^\/+|\/+$/g, "");
  const pascalName = toPascalCase(normalizedPath);
  const camelName = toCamelCase(normalizedPath);

  const routeDir = path.join(process.cwd(), "src", "app", "api", ...normalizedPath.split("/"));
  const routeFilePath = path.join(routeDir, "route.ts");

  const actionDir = path.join(process.cwd(), "src", "server", "actions");
  const actionFileName = `${camelName}Action.ts`;
  const actionFilePath = path.join(actionDir, actionFileName);
  const actionFnName = `${camelName}Action`;

  ensureDir(routeDir);
  ensureDir(actionDir);

  writeFileSafely(routeFilePath, buildRouteTemplate(`/api/${normalizedPath}`, args.method, pascalName), args.force);
  writeFileSafely(actionFilePath, buildActionTemplate(actionFnName, normalizedPath, pascalName), args.force);

  console.log("[OK] API scaffold generated");
  console.log(` - Route : ${path.relative(process.cwd(), routeFilePath)}`);
  console.log(` - Action: ${path.relative(process.cwd(), actionFilePath)}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}
