import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import {
  AUTH_ADMIN_ROLE,
  authenticateAdmin,
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_TTL_SECONDS,
  issueAuthToken,
  sanitizeRedirectPath
} from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

const loginBodySchema = z.object({
  identifier: z.string().trim().min(1, "请输入邮箱或用户名").optional(),
  identity  : z.string().trim().min(1, "请输入邮箱或用户名").optional(),
  password  : z.string().min(1, "请输入密码"),
  redirect  : z.string().optional()
}).superRefine((value, context) => {
  if (value.identifier || value.identity) {
    return;
  }

  context.addIssue({
    code   : z.ZodIssueCode.custom,
    message: "请输入邮箱或用户名",
    path   : ["identifier"]
  });
});

interface LoginResponseData {
  redirect: string;
  user: {
    id: string;
    username: string;
    email: string;
    name: string;
    role: typeof AUTH_ADMIN_ROLE;
  };
}

function badRequestJson(
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const meta = createApiMeta("/api/auth/login", requestId, startedAt);

  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "登录参数不合法",
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const body = await request.json();
    const parsedResult = loginBodySchema.safeParse(body);

    if (!parsedResult.success) {
      return badRequestJson(requestId, startedAt, parsedResult.error.issues[0]?.message ?? "请求参数不合法");
    }

    const identifier = parsedResult.data.identifier ?? parsedResult.data.identity ?? "";
    const user = await authenticateAdmin({
      identifier,
      password  : parsedResult.data.password
    });

    const redirect = sanitizeRedirectPath(parsedResult.data.redirect);
    const token = issueAuthToken();

    const response = okJson<LoginResponseData>({
      path   : "/api/auth/login",
      requestId,
      startedAt,
      code   : "AUTH_LOGGED_IN",
      message: "登录成功",
      data   : {
        redirect,
        user
      }
    });

    response.cookies.set({
      name    : AUTH_COOKIE_NAME,
      value   : token,
      httpOnly: true,
      maxAge  : AUTH_TOKEN_TTL_SECONDS,
      path    : "/",
      sameSite: "lax",
      secure  : process.env.NODE_ENV === "production"
    });

    return response;
  } catch (error) {
    return failJson({
      path           : "/api/auth/login",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "登录失败"
    });
  }
}
