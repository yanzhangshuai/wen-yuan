# Model Config Customizable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI model configuration fully customizable — admins can add/delete any model via the UI, provider is a free-form string (not a hardcoded enum), and the model panel groups cards by provider with collapse/expand.

**Architecture:** Replace the `SupportedProvider` TypeScript enum with `string`; refactor SSRF protection from per-provider whitelist to a universal private-IP blacklist; add `createModel`/`deleteModel` to the service module, route layer, and frontend; rebuild the model-manager UI to group cards by provider with add/delete actions.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7, Zod, Radix UI, shadcn/ui, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/server/modules/models/connectivity.ts` | Modify | SSRF guard: whitelist → private-IP blacklist |
| `src/server/modules/models/index.ts` | Modify | `SupportedProvider → string`, add `createModel`/`deleteModel` |
| `src/server/modules/models/index.test.ts` | Modify | Update allowlist→blacklist test; remove unsupported-provider test; add create/delete tests |
| `src/server/modules/models/admin-adapters.ts` | Modify | Add `createAdminModel`/`deleteAdminModel` adapters |
| `src/app/api/admin/models/_shared.ts` | Modify | Add `createModelBodySchema` |
| `src/app/api/admin/models/route.ts` | Modify | Add `POST` handler for model creation |
| `src/app/api/admin/models/route.test.ts` | Modify | Add POST route tests |
| `src/app/api/admin/models/[id]/route.ts` | Modify | Add `DELETE` handler |
| `src/app/api/admin/models/[id]/route.test.ts` | Modify | Add DELETE route tests |
| `src/lib/services/models.ts` | Modify | Add `CreateModelPayload`, `createAdminModel`, `deleteAdminModel` |
| `src/app/admin/model/_components/add-model-dialog.tsx` | **Create** | Dialog form for adding a new model |
| `src/app/admin/model/_components/model-manager.tsx` | Modify | Provider grouping with collapse, add/delete model, AlertDialog |

---

## Task 1: SSRF Blacklist — connectivity.ts

**Files:**
- Modify: `src/server/modules/models/connectivity.ts`
- Modify: `src/server/modules/models/index.ts` (callsite update — done in Task 2)

- [ ] **Step 1: Replace whitelist logic with private-IP blacklist**

Open `src/server/modules/models/connectivity.ts`.

**Change the import** (line 1) from:
```typescript
import type { ModelConnectivityErrorType, SupportedProvider } from "./index";
```
to:
```typescript
import type { ModelConnectivityErrorType } from "./index";
```

**Remove** the following three exports entirely (lines 3–39):
- `connectivityHostAllowList` constant
- `parseExtraConnectivityHosts` function
- `isAllowedHost` function

**Add** the following new exports **at the top of the file**, right after the import line:
```typescript
const BLOCKED_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^::1$/,
  /^\[::1\]$/,
  /^0\.0\.0\.0$/
];

/**
 * 功能：判断给定 hostname 是否属于需要拦截的内网/本机地址。
 * 输入：hostname（已从 URL 解析出的主机名，不含端口）。
 * 输出：true 表示该地址在黑名单内，应被拦截。
 * 异常：无。
 * 副作用：无。
 */
export function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOST_PATTERNS.some(pattern => pattern.test(hostname));
}
```

**Replace** `assertConnectivityBaseUrlAllowed` (lines 41–69) with:
```typescript
/**
 * 功能：对连通性测试 BaseURL 做安全边界校验（协议 + 内网黑名单）。
 * 输入：baseUrl。
 * 输出：void，校验通过即允许继续请求。
 * 异常：BaseURL 非法、非 HTTPS、域名命中内网黑名单时抛错。
 * 副作用：无。
 */
export function assertConnectivityBaseUrlAllowed(baseUrl: string): void {
  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error("BaseURL 不合法");
  }

  if (parsedBaseUrl.protocol !== "https:") {
    throw new Error("连通性测试仅支持 HTTPS BaseURL");
  }

  if (isBlockedHost(parsedBaseUrl.hostname)) {
    throw new Error("连通性测试不允许访问内网地址");
  }
}
```

- [ ] **Step 2: Run type-check to confirm no compile errors**

```bash
cd /home/mwjz/code/wen-yuan && pnpm type-check 2>&1 | head -40
```

Expected: errors only about the call-site `assertConnectivityBaseUrlAllowed(provider, baseUrl)` in `index.ts` (which we fix in Task 2). No other errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/modules/models/connectivity.ts
git commit -m "refactor(models): replace SSRF whitelist with private-IP blacklist

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Type Widening + createModel/deleteModel — index.ts + tests

**Files:**
- Modify: `src/server/modules/models/index.ts`
- Modify: `src/server/modules/models/index.test.ts`

- [ ] **Step 1: Widen SupportedProvider and providerSchema**

In `src/server/modules/models/index.ts`:

**Line 40** — change:
```typescript
export type SupportedProvider = "deepseek" | "qwen" | "doubao" | "gemini" | "glm";
```
to:
```typescript
export type SupportedProvider = string;
```

**Line 42** — change:
```typescript
const providerSchema = z.enum(["deepseek", "qwen", "doubao", "gemini", "glm"]);
```
to:
```typescript
const providerSchema = z.string().trim().min(1, "供应商不能为空");
```

**Line 121** (inside `ModelListItem` interface) — change:
```typescript
  provider       : "deepseek" | "qwen" | "doubao" | "gemini" | "glm";
```
to:
```typescript
  provider       : string;
```

- [ ] **Step 2: Fix toModelListItem and testModelConnectivity call sites**

In `toModelListItem` (around line 284) — change:
```typescript
    provider       : providerSchema.parse(model.provider.toLowerCase()),
```
to:
```typescript
    provider       : model.provider.toLowerCase(),
```

In `testModelConnectivity` (around line 517) — change:
```typescript
    const provider = providerSchema.parse(model.provider.toLowerCase());
```
to:
```typescript
    const provider = model.provider.toLowerCase();
```

On the next line (around line 525) — change:
```typescript
    assertConnectivityBaseUrlAllowed(provider, baseUrl);
```
to:
```typescript
    assertConnectivityBaseUrlAllowed(baseUrl);
```

- [ ] **Step 3: Add CreateModelInput interface and createModelInputSchema**

After the `UpdateAdminModelPayload` interface (around line 171), add:

```typescript
export interface CreateModelInput {
  /** 供应商标识，自由字符串（如 deepseek / openai / my-provider）。 */
  provider       : string;
  /** 管理端展示名称。 */
  name           : string;
  /** 供应商侧模型 ID（实际调用时使用）。 */
  providerModelId: string;
  /** 提供商 API Base URL（必须是合法 HTTPS URL）。 */
  baseUrl        : string;
  /** 明文 API Key（可选；不传表示暂不配置）。 */
  apiKey?        : string;
}
```

After the `updateModelInputSchema` (after line 64), add:

```typescript
const createModelInputSchema = z.object({
  provider       : z.string().trim().min(1, "供应商不能为空"),
  name           : z.string().trim().min(1, "名称不能为空"),
  providerModelId: providerModelIdSchema,
  baseUrl        : z.string().trim().url("BaseURL 格式不合法"),
  apiKey         : z.string().trim().min(1, "API Key 不能为空").optional()
});
```

- [ ] **Step 4: Add createModel and deleteModel inside createModelsModule**

Inside `createModelsModule` (before the `return { ... }` at line 612), add:

```typescript
  async function createModel(input: CreateModelInput): Promise<ModelListItem> {
    const parsed = createModelInputSchema.parse(input);
    const apiKeyEncrypted = parsed.apiKey ? encryptValue(parsed.apiKey) : null;

    const record = await prismaClient.aiModel.create({
      data: {
        provider : parsed.provider,
        name     : parsed.name,
        modelId  : parsed.providerModelId,
        baseUrl  : parsed.baseUrl,
        apiKey   : apiKeyEncrypted,
        isEnabled: false,
        isDefault: false,
        aliasKey : null
      },
      select: modelSelect
    });

    return toModelListItem(record);
  }

  async function deleteModel(id: string): Promise<void> {
    const parsedId = idSchema.parse(id);
    await prismaClient.aiModel.delete({ where: { id: parsedId } });
  }
```

Update the return statement (around line 612) to:
```typescript
  return {
    listModels,
    updateModel,
    setDefaultModel,
    testModelConnectivity,
    createModel,
    deleteModel
  };
```

- [ ] **Step 5: Update index.test.ts — fix allowlist test, remove unsupported-provider test**

In `src/server/modules/models/index.test.ts`:

**Update the test at lines 545–562** (the "rejects connectivity test when base url host is not in allowlist" test):
- Change test name to: `"rejects connectivity test when base url is a private IP"`
- Change `baseUrl: "https://internal.example.com"` to `baseUrl: "https://192.168.1.100"`
- Change expected error message from `"连通性测试地址不在白名单内"` to `"连通性测试不允许访问内网地址"`

Full updated test:
```typescript
  it("rejects connectivity test when base url is a private IP", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn();
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          baseUrl: "https://192.168.1.100",
          apiKey : encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);

    await expect(modelsModule.testModelConnectivity("model-1")).rejects.toThrow("连通性测试不允许访问内网地址");
    expect(fetchMock).not.toHaveBeenCalled();
  });
```

**Remove the test at lines 595–613** ("throws when list API detects unsupported provider") entirely.

- [ ] **Step 6: Add tests for createModel and deleteModel**

Append these tests inside the `describe("models module", ...)` block in `index.test.ts`:

```typescript
  it("creates a new model with encrypted api key and returns ModelListItem", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const createdRecord = createAiModelRecord({
      id      : "new-model-id",
      provider: "openai",
      name    : "GPT-4o",
      modelId : "gpt-4o",
      baseUrl : "https://api.openai.com",
      apiKey  : encryptValue("sk-test-key")
    });

    const prismaClient = {
      aiModel: {
        create: vi.fn().mockResolvedValue(createdRecord)
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);

    const result = await modelsModule.createModel({
      provider       : "openai",
      name           : "GPT-4o",
      providerModelId: "gpt-4o",
      baseUrl        : "https://api.openai.com",
      apiKey         : "sk-test-key"
    });

    expect(result.id).toBe("new-model-id");
    expect(result.provider).toBe("openai");
    expect(result.name).toBe("GPT-4o");
    expect(result.providerModelId).toBe("gpt-4o");
    expect(result.isEnabled).toBe(false);
    expect(result.isDefault).toBe(false);
    expect(result.isConfigured).toBe(true);

    const createCall = (prismaClient as { aiModel: { create: ReturnType<typeof vi.fn> } }).aiModel.create;
    expect(createCall).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        provider : "openai",
        name     : "GPT-4o",
        modelId  : "gpt-4o",
        baseUrl  : "https://api.openai.com",
        isEnabled: false,
        isDefault: false,
        aliasKey : null
      })
    }));

    // API key must be stored encrypted, not plaintext
    const storedApiKey: string = createCall.mock.calls[0][0].data.apiKey;
    expect(storedApiKey).toMatch(/^enc:v1:/);
    expect(decryptValue(storedApiKey)).toBe("sk-test-key");
  });

  it("creates a model without api key when apiKey is omitted", async () => {
    const createdRecord = createAiModelRecord({
      id     : "new-model-no-key",
      apiKey : null,
      baseUrl: "https://api.custom.com"
    });

    const prismaClient = {
      aiModel: {
        create: vi.fn().mockResolvedValue(createdRecord)
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);

    const result = await modelsModule.createModel({
      provider       : "custom",
      name           : "Custom Model",
      providerModelId: "custom-v1",
      baseUrl        : "https://api.custom.com"
    });

    expect(result.isConfigured).toBe(false);
    expect(result.apiKeyMasked).toBeNull();

    const createCall = (prismaClient as { aiModel: { create: ReturnType<typeof vi.fn> } }).aiModel.create;
    expect(createCall.mock.calls[0][0].data.apiKey).toBeNull();
  });

  it("throws when creating a model with missing required fields", async () => {
    const prismaClient = { aiModel: { create: vi.fn() } } as never;
    const modelsModule = createModelsModule(prismaClient);

    await expect(modelsModule.createModel({
      provider       : "",
      name           : "Bad Model",
      providerModelId: "model-id",
      baseUrl        : "https://api.example.com"
    })).rejects.toThrow("供应商不能为空");
  });

  it("deletes a model by id", async () => {
    const prismaClient = {
      aiModel: {
        delete: vi.fn().mockResolvedValue(undefined)
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await modelsModule.deleteModel("model-1");

    expect((prismaClient as { aiModel: { delete: ReturnType<typeof vi.fn> } }).aiModel.delete)
      .toHaveBeenCalledWith({ where: { id: "model-1" } });
  });

  it("throws when deleting with an empty id", async () => {
    const prismaClient = { aiModel: { delete: vi.fn() } } as never;
    const modelsModule = createModelsModule(prismaClient);

    await expect(modelsModule.deleteModel("")).rejects.toThrow("模型 ID 不能为空");
  });
```

- [ ] **Step 7: Run tests to verify**

```bash
cd /home/mwjz/code/wen-yuan && npx vitest run src/server/modules/models/index.test.ts 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 8: Run type-check**

```bash
cd /home/mwjz/code/wen-yuan && pnpm type-check 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/server/modules/models/index.ts src/server/modules/models/index.test.ts
git commit -m "feat(models): widen provider to string, add createModel/deleteModel

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Admin Adapters + Re-exports

**Files:**
- Modify: `src/server/modules/models/admin-adapters.ts`
- Modify: `src/server/modules/models/index.ts` (re-export list)

- [ ] **Step 1: Add imports and new adapter functions to admin-adapters.ts**

In `src/server/modules/models/admin-adapters.ts`:

Update the type import block (lines 1–7) to include `CreateModelInput`:
```typescript
import type {
  ApiKeyChange,
  CreateModelInput,
  ModelConnectivityResult,
  ModelListItem,
  UpdateAdminModelPayload,
  UpdateModelInput
} from "./index";
import { createModelsModule } from "./index";
```

Append the following two functions after `testAdminModelConnection` (after line 78):

```typescript
export async function createAdminModel(input: CreateModelInput): Promise<ModelListItem> {
  return (await getDefaultModelsModule()).createModel(input);
}

export async function deleteAdminModel(id: string): Promise<void> {
  return (await getDefaultModelsModule()).deleteModel(id);
}
```

- [ ] **Step 2: Add createAdminModel and deleteAdminModel to re-exports in index.ts**

In `src/server/modules/models/index.ts`, update the re-export block (lines 621–631) to:

```typescript
// ── Admin adapters (re-exported for backward compatibility) ──────────────
export {
  createAdminModel,
  deleteAdminModel,
  listAdminModels,
  listModels,
  setDefaultAdminModel,
  setDefaultModel,
  testAdminModelConnection,
  testModelConnectivity,
  updateAdminModel,
  updateModel
} from "./admin-adapters";
```

- [ ] **Step 3: Run type-check**

```bash
cd /home/mwjz/code/wen-yuan && pnpm type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/modules/models/admin-adapters.ts src/server/modules/models/index.ts
git commit -m "feat(models): add createAdminModel/deleteAdminModel adapters

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: POST /api/admin/models — Create Route

**Files:**
- Modify: `src/app/api/admin/models/_shared.ts`
- Modify: `src/app/api/admin/models/route.ts`
- Modify: `src/app/api/admin/models/route.test.ts`

- [ ] **Step 1: Add createModelBodySchema to _shared.ts**

Append to `src/app/api/admin/models/_shared.ts` (after the existing `badRequestJson` function):

```typescript
/** 创建模型请求体 Schema。 */
export const createModelBodySchema = z.object({
  /** 供应商标识，自由字符串（如 deepseek / openai / my-provider）。 */
  provider       : z.string().trim().min(1, "供应商不能为空"),
  /** 管理端展示名称。 */
  name           : z.string().trim().min(1, "名称不能为空"),
  /** 供应商侧模型标识（实际调用使用）。 */
  providerModelId: z.string().trim().min(1, "模型标识不能为空"),
  /** API 基础地址（合法 HTTPS URL）。 */
  baseUrl        : z.string().trim().url("BaseURL 格式不合法"),
  /** 明文 API Key（可选）。 */
  apiKey         : z.string().trim().min(1, "API Key 不能为空").optional()
});
```

- [ ] **Step 2: Add POST handler to route.ts**

Open `src/app/api/admin/models/route.ts`.

Add `readJsonBody` to imports:
```typescript
import { readJsonBody } from "@/server/http/read-json-body";
```

Add `createAdminModel` to the models import:
```typescript
import { createAdminModel, listAdminModels } from "@/server/modules/models";
```

Add `badRequestJson` and `createModelBodySchema` to the _shared import:
```typescript
import { badRequestJson, createModelBodySchema } from "./_shared";
```

Append the `POST` function after the `GET` function:

```typescript
/**
 * POST `/api/admin/models`
 * 功能：创建新模型配置。
 * 入参：provider、name、providerModelId、baseUrl（必须）；apiKey（可选）。
 * 返回：新创建的模型配置快照（isEnabled=false，isDefault=false）。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedBody = createModelBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        "/api/admin/models",
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createAdminModel(parsedBody.data);

    return okJson({
      path     : "/api/admin/models",
      requestId,
      startedAt,
      code     : "ADMIN_MODEL_CREATED",
      message  : "模型创建成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/models",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型创建失败"
    });
  }
}
```

- [ ] **Step 3: Write failing tests for POST**

Open `src/app/api/admin/models/route.test.ts`.

Add `createAdminModelMock` at the top with the other mocks:
```typescript
const createAdminModelMock = vi.fn();
```

Add it to the `vi.mock("@/server/modules/models", ...)` factory:
```typescript
vi.mock("@/server/modules/models", () => ({
  listAdminModels         : listAdminModelsMock,
  updateAdminModel        : updateAdminModelMock,
  setDefaultAdminModel    : setDefaultAdminModelMock,
  testAdminModelConnection: testAdminModelConnectionMock,
  createAdminModel        : createAdminModelMock
}));
```

Add `createAdminModelMock.mockReset()` to `afterEach`.

Append the following `describe` block after the existing `describe("GET /api/admin/models", ...)`:

```typescript
describe("POST /api/admin/models", () => {
  const validBody = {
    provider       : "openai",
    name           : "GPT-4o",
    providerModelId: "gpt-4o",
    baseUrl        : "https://api.openai.com"
  };

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    createAdminModelMock.mockReset();
    vi.resetModules();
  });

  it("creates a model and returns 200 with ADMIN_MODEL_CREATED", async () => {
    createAdminModelMock.mockResolvedValue({
      id             : "new-uuid",
      provider       : "openai",
      name           : "GPT-4o",
      providerModelId: "gpt-4o",
      baseUrl        : "https://api.openai.com",
      isEnabled      : false,
      isDefault      : false
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/models", {
        method : "POST",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify(validBody)
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MODEL_CREATED");
    expect(payload.data.provider).toBe("openai");
    expect(createAdminModelMock).toHaveBeenCalledWith(validBody);
  });

  it("returns 403 when not admin", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/models", {
        method : "POST",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify(validBody)
      })
    );

    expect(response.status).toBe(403);
    expect(createAdminModelMock).not.toHaveBeenCalled();
  });

  it("returns 400 when provider is missing", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/models", {
        method : "POST",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ name: "X", providerModelId: "y", baseUrl: "https://a.com" })
      })
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("供应商不能为空");
  });

  it("returns 400 when baseUrl is not a valid URL", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/models", {
        method : "POST",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ ...validBody, baseUrl: "not-a-url" })
      })
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error?.detail).toBe("BaseURL 格式不合法");
  });

  it("returns 500 when service throws", async () => {
    createAdminModelMock.mockRejectedValue(new Error("db write failed"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/models", {
        method : "POST",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify(validBody)
      })
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.message).toBe("模型创建失败");
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd /home/mwjz/code/wen-yuan && npx vitest run src/app/api/admin/models/route.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/models/_shared.ts src/app/api/admin/models/route.ts src/app/api/admin/models/route.test.ts
git commit -m "feat(api): add POST /api/admin/models for model creation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: DELETE /api/admin/models/[id]

**Files:**
- Modify: `src/app/api/admin/models/[id]/route.ts`
- Modify: `src/app/api/admin/models/[id]/route.test.ts`

- [ ] **Step 1: Add DELETE handler to [id]/route.ts**

Open `src/app/api/admin/models/[id]/route.ts`.

Add `deleteAdminModel` to the models import:
```typescript
import { deleteAdminModel, updateAdminModel } from "@/server/modules/models";
```

Append the `DELETE` function after the `PATCH` function:

```typescript
/**
 * DELETE `/api/admin/models/:id`
 * 功能：永久删除指定模型配置（不可恢复）。
 * 入参：路由参数 `id`（模型 UUID）。
 * 返回：删除成功的标准响应（data 为 null）。
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = modelRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        "/api/admin/models/[id]",
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    await deleteAdminModel(parsedParams.data.id);

    return okJson({
      path     : `/api/admin/models/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code     : "ADMIN_MODEL_DELETED",
      message  : "模型已删除",
      data     : null
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/models/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型删除失败"
    });
  }
}
```

- [ ] **Step 2: Write failing tests for DELETE**

Open `src/app/api/admin/models/[id]/route.test.ts`.

Add `deleteAdminModelMock` at the top with the other mocks:
```typescript
const deleteAdminModelMock = vi.fn();
```

Update the `vi.mock("@/server/modules/models", ...)` factory to include it:
```typescript
vi.mock("@/server/modules/models", () => ({
  listAdminModels         : listAdminModelsMock,
  updateAdminModel        : updateAdminModelMock,
  setDefaultAdminModel    : setDefaultAdminModelMock,
  testAdminModelConnection: testAdminModelConnectionMock,
  deleteAdminModel        : deleteAdminModelMock
}));
```

Add `deleteAdminModelMock.mockReset()` to `afterEach`.

Append the following `describe` block after the existing `describe("PATCH /api/admin/models/:id", ...)`:

```typescript
describe("DELETE /api/admin/models/:id", () => {
  const validId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    deleteAdminModelMock.mockReset();
    vi.resetModules();
  });

  it("deletes a model and returns 200 with ADMIN_MODEL_DELETED", async () => {
    deleteAdminModelMock.mockResolvedValue(undefined);
    const { DELETE } = await import("./route");

    const response = await DELETE(
      new Request(`http://localhost/api/admin/models/${validId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MODEL_DELETED");
    expect(deleteAdminModelMock).toHaveBeenCalledWith(validId);
  });

  it("returns 403 when not admin", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { DELETE } = await import("./route");

    const response = await DELETE(
      new Request(`http://localhost/api/admin/models/${validId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(403);
    expect(deleteAdminModelMock).not.toHaveBeenCalled();
  });

  it("returns 400 when id is not a valid UUID", async () => {
    const { DELETE } = await import("./route");

    const response = await DELETE(
      new Request("http://localhost/api/admin/models/invalid", { method: "DELETE" }),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error?.detail).toBe("模型 ID 不合法");
    expect(deleteAdminModelMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    deleteAdminModelMock.mockRejectedValue(new Error("db delete failed"));
    const { DELETE } = await import("./route");

    const response = await DELETE(
      new Request(`http://localhost/api/admin/models/${validId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.message).toBe("模型删除失败");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /home/mwjz/code/wen-yuan && npx vitest run "src/app/api/admin/models/\[id\]/route.test.ts" 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/admin/models/[id]/route.ts" "src/app/api/admin/models/[id]/route.test.ts"
git commit -m "feat(api): add DELETE /api/admin/models/:id

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Frontend Service Layer

**Files:**
- Modify: `src/lib/services/models.ts`

- [ ] **Step 1: Add CreateModelPayload, createAdminModel, deleteAdminModel**

Open `src/lib/services/models.ts`.

Add `clientMutate` to the import on line 22:
```typescript
import { clientFetch, clientMutate } from "@/lib/client-api";
```

After the `PatchModelBody` interface (around line 126), add:

```typescript
/**
 * 新建模型配置的请求体。
 */
export interface CreateModelPayload {
  /** 供应商标识（自由字符串，如 deepseek / openai / my-provider）。 */
  provider       : string;
  /** 管理端展示名称。 */
  name           : string;
  /** 供应商侧模型 ID（实际调用时使用）。 */
  providerModelId: string;
  /** API 基础地址（合法 HTTPS URL）。 */
  baseUrl        : string;
  /** 明文 API Key（可选）。 */
  apiKey?        : string;
}
```

At the end of the file, append:

```typescript
/**
 * 创建新模型配置。
 * 对应接口：POST /api/admin/models
 *
 * 成功时返回新创建的模型项（isEnabled=false，isDefault=false）。
 * 失败时抛出 Error。
 *
 * @param payload 模型创建参数
 * @returns 新创建的 AdminModelItem
 */
export async function createAdminModel(payload: CreateModelPayload): Promise<AdminModelItem> {
  return clientFetch<AdminModelItem>("/api/admin/models", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(payload)
  });
}

/**
 * 永久删除指定模型配置（不可恢复）。
 * 对应接口：DELETE /api/admin/models/:id
 *
 * 成功时无返回值；失败时抛出 Error。
 *
 * @param id 模型 ID
 */
export async function deleteAdminModel(id: string): Promise<void> {
  await clientMutate(`/api/admin/models/${id}`, {
    method: "DELETE"
  });
}
```

- [ ] **Step 2: Run type-check**

```bash
cd /home/mwjz/code/wen-yuan && pnpm type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/models.ts
git commit -m "feat(services): add createAdminModel/deleteAdminModel client functions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: AddModelDialog Component

**Files:**
- **Create**: `src/app/admin/model/_components/add-model-dialog.tsx`

- [ ] **Step 1: Create add-model-dialog.tsx**

Create `src/app/admin/model/_components/add-model-dialog.tsx` with the following content:

```typescript
"use client";

import { useState } from "react";

import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAdminModel, type AdminModelItem, type CreateModelPayload } from "@/lib/services/models";

interface AddModelDialogProps {
  open        : boolean;
  onOpenChange: (open: boolean) => void;
  onCreated   : (model: AdminModelItem) => void;
}

interface FormState {
  provider       : string;
  name           : string;
  providerModelId: string;
  baseUrl        : string;
  apiKey         : string;
}

const INITIAL_FORM: FormState = {
  provider       : "",
  name           : "",
  providerModelId: "",
  baseUrl        : "",
  apiKey         : ""
};

export function AddModelDialog({ open, onOpenChange, onCreated }: AddModelDialogProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  function updateField(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleClose() {
    setForm(INITIAL_FORM);
    setShowApiKey(false);
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!form.provider.trim()) {
      toast.error("供应商不能为空");
      return;
    }
    if (!form.name.trim()) {
      toast.error("名称不能为空");
      return;
    }
    if (!form.providerModelId.trim()) {
      toast.error("模型标识不能为空");
      return;
    }
    if (!form.baseUrl.trim()) {
      toast.error("Base URL 不能为空");
      return;
    }

    setSubmitting(true);

    const payload: CreateModelPayload = {
      provider       : form.provider.trim(),
      name           : form.name.trim(),
      providerModelId: form.providerModelId.trim(),
      baseUrl        : form.baseUrl.trim()
    };
    if (form.apiKey.trim()) {
      payload.apiKey = form.apiKey.trim();
    }

    try {
      const created = await createAdminModel(payload);
      onCreated(created);
      toast.success("模型创建成功");
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新增模型</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>
              供应商 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.provider}
              placeholder="例如 deepseek / openai / my-provider"
              onChange={e => updateField("provider", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>
              显示名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.name}
              placeholder="例如 DeepSeek V4"
              onChange={e => updateField("name", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>
              模型标识 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.providerModelId}
              placeholder="例如 deepseek-v4 / gpt-4o"
              onChange={e => updateField("providerModelId", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Base URL <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.baseUrl}
              placeholder="例如 https://api.deepseek.com"
              onChange={e => updateField("baseUrl", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>API Key（可选）</Label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={form.apiKey}
                placeholder="输入 API Key"
                onChange={e => updateField("apiKey", e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowApiKey(prev => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
              >
                {showApiKey
                  ? <EyeOff className="h-4 w-4" />
                  : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
cd /home/mwjz/code/wen-yuan && pnpm type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/model/_components/add-model-dialog.tsx
git commit -m "feat(ui): add AddModelDialog component for creating new models

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Refactor ModelManager — Provider Grouping + Add/Delete

**Files:**
- Modify: `src/app/admin/model/_components/model-manager.tsx`

This is the largest task. Make the changes carefully in order.

- [ ] **Step 1: Update imports**

In `src/app/admin/model/_components/model-manager.tsx`:

**Line 27** — add `useMemo` to the React import:
```typescript
import { useEffect, useMemo, useState } from "react";
```

**Lines 38–56** (lucide-react imports) — add `ChevronDown`, `Plus`, `Trash2`:
```typescript
import {
  ChevronDown,
  Check,
  Cpu,
  DollarSign,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  Zap
} from "lucide-react";
```

**After the existing UI component imports**, add AlertDialog imports:
```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
```

**Lines 58–63** (services import) — add `createAdminModel`, `deleteAdminModel`:
```typescript
import {
  createAdminModel,
  deleteAdminModel,
  patchModel,
  setDefaultModel,
  testModel,
  type AdminModelItem
} from "@/lib/services/models";
```

**After the services import**, add the AddModelDialog import:
```typescript
import { AddModelDialog } from "./add-model-dialog";
```

- [ ] **Step 2: Add new state variables**

In the `ModelManager` component body, after `const [showApiKeys, ...]` (line 301), add:

```typescript
  /** 新增模型对话框的开关状态。 */
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  /** 当前触发删除确认弹窗的模型 ID；null 表示未激活。 */
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  /** 已折叠的供应商分组 key 集合。 */
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());
```

- [ ] **Step 3: Add handler functions**

After `toggleApiKeyVisibility` (after line 391), add:

```typescript
  function handleToggleProvider(provider: string) {
    /** 切换某供应商分组的展开/折叠状态。 */
    setCollapsedProviders(prev => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  }

  function handleAddModel(item: AdminModelItem) {
    /** 新增模型成功后将其追加到本地模型列表并初始化草稿。 */
    setModels(prev => [...prev, item]);
    setDrafts(prev => ({ ...prev, [item.id]: buildInitialDraft(item) }));
  }

  async function handleDeleteModel(id: string) {
    try {
      await deleteAdminModel(id);
      setModels(prev => prev.filter(m => m.id !== id));
      setDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setDeletingModelId(null);
      toast.success("模型已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
      setDeletingModelId(null);
    }
  }
```

- [ ] **Step 4: Add modelsByProvider memo**

After `sortedModels` (after line 351), add:

```typescript
  const modelsByProvider = useMemo(() => {
    const map = new Map<string, AdminModelItem[]>();
    for (const model of sortedModels) {
      const group = map.get(model.provider) ?? [];
      group.push(model);
      map.set(model.provider, group);
    }
    return map;
  }, [sortedModels]);
```

- [ ] **Step 5: Remove the early empty-state return**

Delete lines 480–492 (the entire block):
```typescript
  if (sortedModels.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground text-center">
          当前没有可配置的模型。
        </CardContent>
      </Card>
    );
  }
```

- [ ] **Step 6: Rewrite the model-config TabsContent**

Locate the `<TabsContent value="model-config" ...>` section (starting around line 536). Replace the entire PageSection for "模型配置" (the part rendering the flat grid) with provider-grouped rendering. Change:

```typescript
        <PageSection
          title="模型配置"
          description="配置可用的 AI 模型及其 API 密钥"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedModels.map(model => {
              // ... entire existing card rendering ...
            })}
          </div>
        </PageSection>
```

Replace with:

```typescript
        <PageSection
          title="模型配置"
          description="配置可用的 AI 模型及其 API 密钥"
        >
          {/* 新增模型按钮 */}
          <div className="flex justify-end mb-4">
            <Button
              size="sm"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              新增模型
            </Button>
          </div>

          {/* 按供应商分组展示 */}
          {models.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground text-center">
                当前没有可配置的模型，点击「新增模型」按钮创建第一个模型。
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Array.from(modelsByProvider.entries()).map(([provider, providerModels]) => (
                <div key={provider}>
                  {/* 供应商分组标题 */}
                  <button
                    type="button"
                    onClick={() => handleToggleProvider(provider)}
                    className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        collapsedProviders.has(provider) && "-rotate-90"
                      )}
                    />
                    <span className="capitalize">{provider}</span>
                    <Badge variant="secondary" className="text-xs">
                      {providerModels.length}
                    </Badge>
                  </button>

                  {/* 折叠控制：折叠时不渲染内容 */}
                  {!collapsedProviders.has(provider) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {providerModels.map(model => {
                        const draft = drafts[model.id] ?? buildInitialDraft(model);
                        const loadingAction = loadingActions[model.id] ?? null;
                        const ratings = model.performance.ratings;

                        return (
                          <div key={model.id}>
                            <Card className={cn("relative", !draft.isEnabled && "opacity-60")}>
                              {model.isDefault && (
                                <Badge className="absolute -top-2 -right-2 z-10">默认</Badge>
                              )}
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                      <Cpu className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                      <CardTitle className="text-base">{model.name}</CardTitle>
                                      <CardDescription>{model.provider}</CardDescription>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={draft.isEnabled}
                                      disabled={!resolveCanEnable(model, draft) && !draft.isEnabled}
                                      onCheckedChange={(checked) =>
                                        updateDraft(model.id, d => ({ ...d, isEnabled: checked }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setDeletingModelId(model.id)}
                                      className="text-muted-foreground hover:text-destructive transition-colors"
                                      aria-label={`删除模型 ${model.name}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {/* 评分条 — 速度 / 稳定 / 费用 */}
                                <div className="grid grid-cols-3 gap-4 text-xs">
                                  <RatingBar value={ratings.speed} icon={Zap} label="速度" />
                                  <RatingBar value={ratings.stability} icon={Check} label="稳定" />
                                  <RatingBar value={ratings.cost} icon={DollarSign} label="费用" variant="destructive" />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  样本 {model.performance.callCount} 次 · 成功率 {formatSuccessRate(model.performance.successRate)}
                                </p>

                                <Separator />

                                {/* 模型标识 */}
                                <div className="space-y-2">
                                  <Label>模型标识</Label>
                                  <Input
                                    value={draft.providerModelId}
                                    placeholder="例如 deepseek-chat / qwen-plus / ep-xxxx"
                                    onChange={event => {
                                      const nextValue = event.target.value;
                                      updateDraft(model.id, d => ({ ...d, providerModelId: nextValue }));
                                    }}
                                  />
                                  {model.provider === "doubao" && (
                                    <p className="text-xs text-amber-600">
                                      豆包请填写方舟控制台中的 Endpoint/模型标识（通常不是 doubao-pro）。
                                    </p>
                                  )}
                                </div>

                                {/* API Key */}
                                <div className="space-y-2">
                                  <Label>API Key</Label>
                                  <div className="flex gap-2">
                                    <div className="relative flex-1">
                                      <Input
                                        type={showApiKeys[model.id] ? "text" : "password"}
                                        value={draft.apiKey}
                                        placeholder={model.isConfigured ? (model.apiKeyMasked ?? "已配置") : "输入 API Key"}
                                        onChange={event => {
                                          const nextValue = event.target.value;
                                          updateDraft(model.id, d => ({ ...d, apiKey: nextValue, clearApiKey: false }));
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => toggleApiKeyVisibility(model.id)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        aria-label={showApiKeys[model.id] ? "隐藏 API Key" : "显示 API Key"}
                                      >
                                        {showApiKeys[model.id] ? (
                                          <EyeOff className="h-4 w-4" />
                                        ) : (
                                          <Eye className="h-4 w-4" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Base URL */}
                                <div className="space-y-2">
                                  <Label>Base URL（可选）</Label>
                                  <Input
                                    value={draft.baseUrl}
                                    placeholder="使用默认地址"
                                    onChange={event => {
                                      const nextValue = event.target.value;
                                      updateDraft(model.id, d => ({ ...d, baseUrl: nextValue }));
                                    }}
                                  />
                                </div>

                                {/* 操作按钮 */}
                                <div className="flex items-center justify-between pt-2">
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => void handleTest(model.id)}
                                      disabled={loadingAction === "test"}
                                    >
                                      {loadingAction === "test" ? (
                                        <>
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          测试中
                                        </>
                                      ) : (
                                        "测试连接"
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={loadingAction === "save"}
                                      onClick={() => void handleSave(model)}
                                    >
                                      {loadingAction === "save" ? "保存中..." : "保存"}
                                    </Button>
                                  </div>
                                  {loadingAction === null && model.isConfigured && (
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                      <Check className="h-4 w-4 text-primary" />
                                      <span className="text-primary">已配置</span>
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>

                            {/* 删除确认对话框：每张卡片独立挂载，对应其 deletingModelId 状态 */}
                            <AlertDialog
                              open={deletingModelId === model.id}
                              onOpenChange={(open) => { if (!open) setDeletingModelId(null); }}
                            >
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>确认删除模型？</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    此操作不可撤销，将永久删除「{model.name}」的所有配置。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => void handleDeleteModel(model.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    删除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </PageSection>
```

- [ ] **Step 7: Add AddModelDialog at the end of the JSX return**

Inside the outermost `<Tabs>` component but before its closing tag, add after the `</TabsContent>` for "strategy":

```typescript
        {/* 新增模型对话框 */}
        <AddModelDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          onCreated={handleAddModel}
        />
```

- [ ] **Step 8: Run type-check and lint**

```bash
cd /home/mwjz/code/wen-yuan && pnpm type-check 2>&1 | head -30
```

```bash
cd /home/mwjz/code/wen-yuan && pnpm lint 2>&1 | head -30
```

Expected: no errors. If there are unused import errors (e.g. old lucide icons), remove them.

- [ ] **Step 9: Run all tests to verify nothing is broken**

```bash
cd /home/mwjz/code/wen-yuan && pnpm test 2>&1 | tail -30
```

Expected: all tests pass, coverage thresholds met.

- [ ] **Step 10: Commit**

```bash
git add src/app/admin/model/_components/model-manager.tsx
git commit -m "feat(ui): refactor model-manager with provider grouping, add/delete model

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Free-form provider string (not enum) | Task 1, 2 |
| SSRF blacklist (allow custom URLs, block private IPs) | Task 1 |
| Create model via UI | Task 3, 4, 6, 7, 8 |
| Delete model via UI (no restriction) | Task 3, 5, 6, 8 |
| Group model cards by provider | Task 8 |
| Collapse/expand provider groups | Task 8 |
| Add model button always visible | Task 8 |
| Delete confirmation dialog | Task 8 |

### Type Consistency

- `SupportedProvider` used as `string` in connectivity.ts import → removed in Task 1 ✅
- `CreateModelInput.providerModelId` maps to `modelId` in DB → used in `createModel` create call ✅
- `createAdminModel` in admin-adapters accepts `CreateModelInput` and passes to `createModelsModule().createModel()` ✅
- `deleteAdminModel` in services uses `clientMutate` (void return) ✅
- `handleAddModel` in model-manager appends to `models` and initializes `drafts` ✅
- `handleDeleteModel` in model-manager removes from both `models` and `drafts` ✅
- `deletingModelId` type is `string | null` matching `model.id: string` ✅
