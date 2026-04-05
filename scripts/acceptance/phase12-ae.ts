import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import {
  AnalysisJobStatus,
  type ChapterType,
  NameType,
  PersonaType,
  ProcessingStatus,
  RecordSource,
  PrismaClient
} from "../../src/generated/prisma/client.ts";

/**
 * 文件定位（端到端验收脚本层）：
 * - 该脚本串行执行 Phase12 A-E 五个验收场景，覆盖“导入/分析、人物合并、审核流、模型密钥、权限防护”核心链路。
 * - 它不在 Next.js 请求生命周期中执行，而是作为 CLI 脚本对已启动服务做黑盒 + 白盒（DB）联合验收。
 *
 * 业务目标：
 * - 验证关键 API 与数据库状态迁移在真实环境下可协同工作，避免只靠单测导致链路断裂。
 *
 * 上游依赖：
 * - 已启动的 Next.js 服务（BASE_URL）。
 * - 管理员账号、数据库连接等环境变量。
 *
 * 下游产出：
 * - 控制台日志与退出码；失败时可直接阻断发布/提测流程。
 *
 * 风险提示（注释建议，不改逻辑）：
 * - 脚本会写入并删除真实数据，建议仅在测试环境使用。
 */
type HttpResult = {
  // HTTP 状态码。
  status : number;
  // 响应头（提取 cookie、location 等）。
  headers: Headers;
  // 原始响应体文本（错误时优先看这个）。
  text   : string;
  // 解析后的 JSON，解析失败时为 null。
  json   : any;
};

const BASE_URL = process.env.ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3060";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
const MARK = `phase12-ae-${Date.now()}`;
const API_KEY_PLAIN = "sk-test-key-123";

if (!DATABASE_URL) {
  throw new Error("Missing DATABASE_URL");
}
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error("Missing ADMIN_USERNAME or ADMIN_PASSWORD");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: DATABASE_URL })
});

const created = {
  // 记录本次创建的书籍，供 finally 清理。
  bookIds   : [] as string[],
  // 记录本次创建的人物，供 finally 清理。
  personaIds: [] as string[]
};

// 统一日志时间戳，方便在 CI 中定位链路耗时与失败节点。
function now() {
  return new Date().toISOString();
}

function log(message: string) {
  console.log(`[${now()}] ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// 小工具：显式等待（用于重试/轮询场景）。
async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 统一请求封装。
 * - 无论响应是否为 JSON，都会返回原始 text；
 * - JSON 解析失败不抛错，避免屏蔽真实 HTTP 错误信息。
 */
async function request(path: string, init?: RequestInit): Promise<HttpResult> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  const text = await response.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status : response.status,
    headers: response.headers,
    text,
    json
  };
}

/**
 * 校验统一成功信封（`{ success: true, code }`）。
 * 这是项目接口层的业务契约，不是技术限制。
 */
function expectSuccessEnvelope(result: HttpResult, code?: string) {
  assert(result.json && typeof result.json === "object", `Expected JSON response, got: ${result.text.slice(0, 300)}`);
  assert(result.json.success === true, `Expected success=true, got: ${result.text.slice(0, 300)}`);
  if (code) {
    assert(result.json.code === code, `Expected code=${code}, got ${result.json.code}`);
  }
}

/**
 * 从登录响应提取 cookie。
 * 如果 cookie 缺失，后续所有管理员接口都将失败，因此在此处尽早失败。
 */
function extractCookie(setCookieHeader: string | null): string {
  assert(setCookieHeader, "Missing set-cookie header from login response");
  const cookie = setCookieHeader.split(";")[0]?.trim();
  assert(cookie && cookie.includes("="), `Invalid set-cookie header: ${setCookieHeader}`);
  return cookie;
}

/**
 * 构造 Origin 候选列表。
 * 目的：兼容本地环境里 `localhost`/`127.0.0.1` 混用导致的 origin 校验差异。
 */
function buildCandidateOrigins(baseUrl: string): string[] {
  const parsedBase = new URL(baseUrl);
  const candidates = new Set<string>();

  candidates.add(parsedBase.origin);
  candidates.add(`${parsedBase.protocol}//localhost${parsedBase.port ? `:${parsedBase.port}` : ""}`);
  candidates.add(`${parsedBase.protocol}//127.0.0.1${parsedBase.port ? `:${parsedBase.port}` : ""}`);

  return Array.from(candidates);
}

/**
 * 场景前置步骤：管理员登录并获取 cookie。
 *
 * @returns 管理员会话 cookie
 */
async function loginAsAdmin(): Promise<string> {
  log("Scene A.1 登录获取 cookie");
  const origins = buildCandidateOrigins(BASE_URL);
  let lastResult: HttpResult | null = null;

  for (const origin of origins) {
    const result = await request("/api/auth/login", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        origin
      },
      body: JSON.stringify({
        identifier: ADMIN_USERNAME,
        password  : ADMIN_PASSWORD,
        redirect  : "/admin"
      })
    });

    lastResult = result;

    if (result.status === 200) {
      expectSuccessEnvelope(result, "AUTH_LOGGED_IN");
      const cookie = extractCookie(result.headers.get("set-cookie"));
      log(`登录成功，已获取管理员 cookie（origin=${origin}）`);
      return cookie;
    }

    if (result.status === 403 && result.json?.code === "AUTH_FORBIDDEN") {
      log(`登录 origin 校验未通过，尝试下一个候选（origin=${origin}）`);
      continue;
    }

    throw new Error(`Login should return 200, got ${result.status}: ${result.text.slice(0, 300)}`);
  }

  const resultText = lastResult ? `${lastResult.status}: ${lastResult.text.slice(0, 300)}` : "no response";
  throw new Error(`Login failed for all candidate origins: ${origins.join(", ")}; last=${resultText}`);
}

/**
 * 构造“上传书籍”表单。
 * 这里模拟真实浏览器上传流程，用于覆盖 multipart/form-data 链路。
 */
function buildBookForm(title: string, fileName: string, textContent: string): FormData {
  const form = new FormData();
  form.append("title", title);
  form.append("author", "验收机器人");
  form.append("dynasty", "现代");
  form.append("description", "phase12 A-E 自动验收样本");
  form.append("file", new File([textContent], fileName, { type: "text/plain" }));
  return form;
}

/**
 * Scene A：完整书籍导入链路验收。
 * 步骤：创建书 -> 查详情 -> 预览分章 -> 确认分章 -> 启动分析 -> 校验任务/书籍状态。
 *
 * @param adminCookie 管理员会话
 * @returns 后续场景需要的 bookId 与首章 chapterId
 */
async function runSceneA(adminCookie: string): Promise<{ bookId: string; chapterId: string }> {
  log("Scene A 开始：完整书籍导入链路");

  const sourceText = [
    "第一回 开篇",
    "张三初入京师，与李四相识。",
    "第二回 再会",
    "张三与李四同游，遇王五。"
  ].join("\n");

  const createBookResult = await request("/api/books", {
    method : "POST",
    headers: {
      cookie: adminCookie
    },
    body: buildBookForm(`${MARK}-book-a`, `${MARK}-a.txt`, sourceText)
  });

  assert(createBookResult.status === 201, `POST /api/books should return 201, got ${createBookResult.status}`);
  expectSuccessEnvelope(createBookResult, "BOOK_CREATED");

  const bookId = createBookResult.json.data?.id as string;
  assert(bookId, "Missing bookId from create response");
  created.bookIds.push(bookId);

  const getBookResult = await request(`/api/books/${bookId}`);
  assert(getBookResult.status === 200, `GET /api/books/{id} should return 200, got ${getBookResult.status}`);
  expectSuccessEnvelope(getBookResult, "BOOK_FETCHED");
  assert(getBookResult.json.data?.status === "PENDING", `Expected book status=PENDING, got ${getBookResult.json.data?.status}`);

  const previewResult = await request(`/api/books/${bookId}/chapters/preview`);
  assert(previewResult.status === 200, `GET /chapters/preview should return 200, got ${previewResult.status}`);
  expectSuccessEnvelope(previewResult, "BOOK_CHAPTERS_PREVIEWED");

  const previewItems = previewResult.json.data?.items as Array<{
    index      : number;
    chapterType: ChapterType;
    title      : string;
  }>;
  // 预览必须至少返回一章，否则确认分章接口没有业务意义。
  assert(Array.isArray(previewItems) && previewItems.length > 0, "Preview items should not be empty");

  const confirmResult = await request(`/api/books/${bookId}/chapters/confirm`, {
    method : "POST",
    headers: {
      "content-type": "application/json",
      cookie        : adminCookie
    },
    body: JSON.stringify({
      items: previewItems.map((item) => ({
        index      : item.index,
        chapterType: item.chapterType,
        title      : item.title
      }))
    })
  });

  assert(confirmResult.status === 200, `POST /chapters/confirm should return 200, got ${confirmResult.status}`);
  expectSuccessEnvelope(confirmResult, "BOOK_CHAPTERS_CONFIRMED");

  const analyzeResult = await request(`/api/books/${bookId}/analyze`, {
    method : "POST",
    headers: {
      "content-type": "application/json",
      cookie        : adminCookie
    },
    body: JSON.stringify({})
  });

  assert(analyzeResult.status === 202, `POST /analyze should return 202, got ${analyzeResult.status}`);
  expectSuccessEnvelope(analyzeResult, "BOOK_ANALYSIS_STARTED");
  assert(analyzeResult.json.data?.status === AnalysisJobStatus.QUEUED, `Expected analyze response status=QUEUED, got ${analyzeResult.json.data?.status}`);
  assert(analyzeResult.json.data?.bookStatus === "PROCESSING", `Expected analyze response bookStatus=PROCESSING, got ${analyzeResult.json.data?.bookStatus}`);
  // parseProgress/parseStage 是前端进度条与状态文案的关键来源，必须在起始时可读。
  assert(analyzeResult.json.data?.parseProgress === 0, `Expected analyze response parseProgress=0, got ${analyzeResult.json.data?.parseProgress}`);
  assert(analyzeResult.json.data?.parseStage === "文本清洗", `Expected analyze response parseStage=文本清洗, got ${analyzeResult.json.data?.parseStage}`);

  const jobId = analyzeResult.json.data?.jobId as string;
  assert(jobId, "Missing jobId from analyze response");

  const createdJob = await prisma.analysisJob.findUnique({
    where : { id: jobId },
    select: { id: true, status: true }
  });
  assert(createdJob?.id === jobId, "analysis_jobs should contain the created job");

  const updatedBook = await prisma.book.findUnique({
    where : { id: bookId },
    select: { status: true, parseProgress: true, parseStage: true }
  });
  assert(updatedBook, "Book should exist in DB after analyze");
  assert(
    updatedBook.status === "PROCESSING" || updatedBook.status === "COMPLETED" || updatedBook.status === "ERROR",
    `Expected book status in [PROCESSING, COMPLETED, ERROR], got ${updatedBook.status}`
  );
  assert(
    typeof updatedBook.parseProgress === "number" && updatedBook.parseProgress >= 0 && updatedBook.parseProgress <= 100,
    `Expected parse_progress in [0,100], got ${updatedBook.parseProgress}`
  );
  assert(
    updatedBook.parseStage === null || typeof updatedBook.parseStage === "string",
    `Expected parse_stage to be string|null, got ${String(updatedBook.parseStage)}`
  );

  const statusResult = await request(`/api/books/${bookId}/status`);
  assert(statusResult.status === 200, `GET /status should return 200, got ${statusResult.status}`);
  expectSuccessEnvelope(statusResult, "BOOK_STATUS_FETCHED");
  const status = statusResult.json.data?.status;
  assert(status === "PROCESSING" || status === "COMPLETED" || status === "ERROR", `Expected status in [PROCESSING, COMPLETED, ERROR], got ${status}`);

  const firstChapter = await prisma.chapter.findFirst({
    where  : { bookId },
    orderBy: { no: "asc" },
    select : { id: true }
  });
  assert(firstChapter?.id, "Missing chapter after confirm");

  log("Scene A 通过");
  return { bookId, chapterId: firstChapter.id };
}

/**
 * Scene B：人物合并链路验收。
 * 目的：验证 merge 后 source 人物被合并，target 接管关系与别名。
 */
async function runSceneB(adminCookie: string, bookId: string, chapterId: string) {
  log("Scene B 开始：人物合并链路");

  const sourcePersona = await prisma.persona.create({
    data: {
      name        : `${MARK}-persona-source`,
      type        : PersonaType.PERSON,
      nameType    : NameType.NAMED,
      recordSource: RecordSource.MANUAL,
      aliases     : [`${MARK}-alias-source`]
    },
    select: { id: true, name: true }
  });

  const targetPersona = await prisma.persona.create({
    data: {
      name        : `${MARK}-persona-target`,
      type        : PersonaType.PERSON,
      nameType    : NameType.NAMED,
      recordSource: RecordSource.MANUAL,
      aliases     : [`${MARK}-alias-target`]
    },
    select: { id: true }
  });

  const thirdPersona = await prisma.persona.create({
    data: {
      name        : `${MARK}-persona-third`,
      type        : PersonaType.PERSON,
      nameType    : NameType.NAMED,
      recordSource: RecordSource.MANUAL
    },
    select: { id: true }
  });

  created.personaIds.push(sourcePersona.id, targetPersona.id, thirdPersona.id);

  await prisma.profile.createMany({
    data: [
      {
        personaId: sourcePersona.id,
        bookId,
        localName: sourcePersona.name
      },
      {
        personaId: targetPersona.id,
        bookId,
        localName: `${MARK}-target-profile`
      },
      {
        personaId: thirdPersona.id,
        bookId,
        localName: `${MARK}-third-profile`
      }
    ]
  });

  const relationship = await prisma.relationship.create({
    data: {
      chapterId,
      sourceId    : sourcePersona.id,
      targetId    : thirdPersona.id,
      type        : "同僚",
      weight      : 1,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED
    },
    select: { id: true }
  });

  const mergeResult = await request("/api/personas/merge", {
    method : "POST",
    headers: {
      "content-type": "application/json",
      cookie        : adminCookie
    },
    body: JSON.stringify({
      sourceId: sourcePersona.id,
      targetId: targetPersona.id
    })
  });

  assert(mergeResult.status === 200, `POST /api/personas/merge should return 200, got ${mergeResult.status}`);
  expectSuccessEnvelope(mergeResult, "PERSONA_MERGED");

  const sourceGet = await request(`/api/personas/${sourcePersona.id}`);
  assert(sourceGet.status === 404, `GET source persona should return 404 after merge, got ${sourceGet.status}`);

  const targetGet = await request(`/api/personas/${targetPersona.id}`);
  assert(targetGet.status === 200, `GET target persona should return 200, got ${targetGet.status}`);
  expectSuccessEnvelope(targetGet, "PERSONA_FETCHED");
  const aliases = targetGet.json.data?.aliases as string[];
  assert(Array.isArray(aliases) && aliases.includes(sourcePersona.name), "Target persona aliases should include source persona name");

  const relationshipsResult = await request(`/api/books/${bookId}/relationships`);
  assert(relationshipsResult.status === 200, `GET /relationships should return 200, got ${relationshipsResult.status}`);
  expectSuccessEnvelope(relationshipsResult, "BOOK_RELATIONSHIPS_FETCHED");
  const redirected = (relationshipsResult.json.data as Array<any>).find((item) => item.id === relationship.id);
  assert(redirected, "Merged relationship should still be present");
  assert(redirected.sourceId === targetPersona.id, `Expected redirected sourceId=${targetPersona.id}, got ${redirected.sourceId}`);

  log("Scene B 通过");
  return { targetPersonaId: targetPersona.id, thirdPersonaId: thirdPersona.id };
}

/**
 * Scene C：审核流程链路验收。
 * 目的：验证 DRAFT -> VERIFIED 的批量审核，以及图谱接口可见性联动。
 */
async function runSceneC(adminCookie: string, bookId: string, chapterId: string, targetPersonaId: string, thirdPersonaId: string) {
  log("Scene C 开始：审核流程链路");

  const draftRelationship = await prisma.relationship.create({
    data: {
      chapterId,
      sourceId    : targetPersonaId,
      targetId    : thirdPersonaId,
      type        : "友好",
      weight      : 0.8,
      evidence    : "自动验收草稿关系",
      recordSource: RecordSource.AI,
      status      : ProcessingStatus.DRAFT
    },
    select: { id: true }
  });

  const draftBiography = await prisma.biographyRecord.create({
    data: {
      personaId   : targetPersonaId,
      chapterId,
      chapterNo   : 1,
      event       : "自动验收草稿传记",
      title       : "草稿事件",
      recordSource: RecordSource.AI,
      status      : ProcessingStatus.DRAFT
    },
    select: { id: true }
  });

  const draftsBefore = await request(`/api/admin/drafts?bookId=${encodeURIComponent(bookId)}`, {
    headers: {
      cookie: adminCookie
    }
  });
  assert(draftsBefore.status === 200, `GET /api/admin/drafts should return 200, got ${draftsBefore.status}`);
  expectSuccessEnvelope(draftsBefore, "ADMIN_DRAFTS_LISTED");

  const relationshipIds = (draftsBefore.json.data?.relationships as Array<any>).map((item) => item.id);
  const biographyIds = (draftsBefore.json.data?.biographyRecords as Array<any>).map((item) => item.id);
  assert(relationshipIds.includes(draftRelationship.id), "Draft relationship should appear in drafts list");
  assert(biographyIds.includes(draftBiography.id), "Draft biography should appear in drafts list");

  const verifyIds = [draftRelationship.id, draftBiography.id];
  const bulkVerifyResult = await request("/api/admin/bulk-verify", {
    method : "POST",
    headers: {
      "content-type": "application/json",
      cookie        : adminCookie
    },
    body: JSON.stringify({ ids: verifyIds })
  });

  assert(bulkVerifyResult.status === 200, `POST /api/admin/bulk-verify should return 200, got ${bulkVerifyResult.status}`);
  expectSuccessEnvelope(bulkVerifyResult, "ADMIN_DRAFTS_BULK_VERIFIED");

  const draftsAfter = await request(`/api/admin/drafts?bookId=${encodeURIComponent(bookId)}`, {
    headers: {
      cookie: adminCookie
    }
  });
  assert(draftsAfter.status === 200, `GET drafts after verify should return 200, got ${draftsAfter.status}`);
  expectSuccessEnvelope(draftsAfter, "ADMIN_DRAFTS_LISTED");

  const relationshipIdsAfter = new Set((draftsAfter.json.data?.relationships as Array<any>).map((item) => item.id));
  const biographyIdsAfter = new Set((draftsAfter.json.data?.biographyRecords as Array<any>).map((item) => item.id));
  assert(!relationshipIdsAfter.has(draftRelationship.id), "Verified relationship should not remain in DRAFT list");
  assert(!biographyIdsAfter.has(draftBiography.id), "Verified biography should not remain in DRAFT list");

  const graphResult = await request(`/api/books/${bookId}/graph`);
  assert(graphResult.status === 200, `GET /graph should return 200, got ${graphResult.status}`);
  expectSuccessEnvelope(graphResult, "BOOK_GRAPH_FETCHED");

  const edge = (graphResult.json.data?.edges as Array<any>).find((item) => item.id === draftRelationship.id);
  assert(edge, "Verified relationship edge should appear in graph");
  assert(edge.status === ProcessingStatus.VERIFIED, `Expected verified edge status=VERIFIED, got ${edge.status}`);

  log("Scene C 通过");
}

/**
 * Scene D：模型密钥管理验收。
 * 目的：验证“接口返回脱敏 + 数据库存储加密 + 测试接口不泄漏明文”三条安全边界。
 */
async function runSceneD(adminCookie: string) {
  log("Scene D 开始：模型密钥管理链路");

  const modelsBefore = await request("/api/admin/models", {
    headers: {
      cookie: adminCookie
    }
  });
  assert(modelsBefore.status === 200, `GET /api/admin/models should return 200, got ${modelsBefore.status}`);
  expectSuccessEnvelope(modelsBefore, "ADMIN_MODELS_LISTED");

  const models = modelsBefore.json.data as Array<any>;
  assert(Array.isArray(models) && models.length > 0, "Model list should not be empty");
  for (const model of models) {
    if (model.apiKeyMasked !== null) {
      // 返回给前端的 apiKey 只允许脱敏值，不能回显明文。
      assert(typeof model.apiKeyMasked === "string" && model.apiKeyMasked.includes("*"), `apiKeyMasked should be masked, got ${model.apiKeyMasked}`);
    }
  }

  const modelId = models[0].id as string;
  assert(modelId, "Missing model id");

  const patchResult = await request(`/api/admin/models/${modelId}`, {
    method : "PATCH",
    headers: {
      "content-type": "application/json",
      cookie        : adminCookie
    },
    body: JSON.stringify({ apiKey: API_KEY_PLAIN })
  });
  assert(patchResult.status === 200, `PATCH /api/admin/models/{id} should return 200, got ${patchResult.status}`);
  expectSuccessEnvelope(patchResult, "ADMIN_MODEL_UPDATED");

  const modelsAfter = await request("/api/admin/models", {
    headers: {
      cookie: adminCookie
    }
  });
  assert(modelsAfter.status === 200, `GET /api/admin/models (after patch) should return 200, got ${modelsAfter.status}`);
  expectSuccessEnvelope(modelsAfter, "ADMIN_MODELS_LISTED");

  const updatedModel = (modelsAfter.json.data as Array<any>).find((item) => item.id === modelId);
  assert(updatedModel, "Updated model should exist in list");
  assert(typeof updatedModel.apiKeyMasked === "string", "Updated model apiKeyMasked should be string");
  assert(updatedModel.apiKeyMasked !== API_KEY_PLAIN, "apiKeyMasked should not expose plain API key");
  assert(!modelsAfter.text.includes(API_KEY_PLAIN), "Response body should not include plain API key");

  const dbModel = await prisma.aiModel.findUnique({
    where : { id: modelId },
    select: { apiKey: true }
  });
  assert(dbModel?.apiKey?.startsWith("enc:v1:"), `DB api_key should start with enc:v1:, got ${dbModel?.apiKey}`);

  const testResult = await request(`/api/admin/models/${modelId}/test`, {
    method : "POST",
    headers: {
      cookie: adminCookie
    }
  });
  assert(testResult.status >= 200 && testResult.status < 600, `POST /models/{id}/test unexpected status: ${testResult.status}`);
  assert(!testResult.text.includes(API_KEY_PLAIN), "Model test response should not contain plain API key");

  log("Scene D 通过");
}

/**
 * Scene E：权限防护验收。
 * 目的：验证匿名访问重定向、Viewer 角色禁止写操作、Admin 可正常写入。
 */
async function runSceneE(adminCookie: string) {
  log("Scene E 开始：权限防护链路");

  const adminPageWithoutCookie = await request("/admin/books", {
    redirect: "manual"
  });
  assert(adminPageWithoutCookie.status === 307, `GET /admin/books without cookie should return 307, got ${adminPageWithoutCookie.status}`);
  const pageRedirect = adminPageWithoutCookie.headers.get("location") ?? "";
  assert(pageRedirect.includes("/login"), `Expected redirect to /login, got ${pageRedirect}`);

  const adminApiWithoutCookie = await request("/api/admin/bulk-verify", {
    method  : "POST",
    redirect: "manual",
    headers : {
      "content-type": "application/json"
    },
    body: JSON.stringify({ ids: [crypto.randomUUID()] })
  });
  assert(adminApiWithoutCookie.status === 307, `POST /api/admin/bulk-verify without cookie should return 307, got ${adminApiWithoutCookie.status}`);
  const apiRedirect = adminApiWithoutCookie.headers.get("location") ?? "";
  assert(apiRedirect.includes("/login"), `Expected admin API redirect to /login, got ${apiRedirect}`);

  const viewerForbidden = await request("/api/books", {
    method : "POST",
    headers: {
      "x-auth-role": "VIEWER"
    },
    body: buildBookForm(`${MARK}-viewer-forbidden`, `${MARK}-viewer.txt`, "第一回\nviewer 无权限")
  });
  assert(viewerForbidden.status === 403, `VIEWER POST /api/books should return 403, got ${viewerForbidden.status}`);

  const adminCreate = await request("/api/books", {
    method : "POST",
    headers: {
      cookie: adminCookie
    },
    body: buildBookForm(`${MARK}-admin-ok`, `${MARK}-admin.txt`, "第一回\nadmin 可导入")
  });
  assert(adminCreate.status === 201, `ADMIN POST /api/books should return 201, got ${adminCreate.status}`);
  expectSuccessEnvelope(adminCreate, "BOOK_CREATED");

  const adminBookId = adminCreate.json.data?.id as string;
  assert(adminBookId, "Missing admin-created bookId in scene E");
  created.bookIds.push(adminBookId);

  log("Scene E 通过");
}

/**
 * 清理脚本创建的数据，避免污染测试环境。
 * 采用“先子表后主表”的删除顺序，遵守外键约束。
 */
async function cleanupCreatedData() {
  if (created.bookIds.length === 0 && created.personaIds.length === 0) {
    return;
  }

  log("开始清理验收数据");

  for (const bookId of created.bookIds) {
    const chapters = await prisma.chapter.findMany({
      where : { bookId },
      select: { id: true }
    });
    const chapterIds = chapters.map((item) => item.id);

    await prisma.analysisJob.deleteMany({ where: { bookId } });

    if (chapterIds.length > 0) {
      await prisma.relationship.deleteMany({ where: { chapterId: { in: chapterIds } } });
      await prisma.biographyRecord.deleteMany({ where: { chapterId: { in: chapterIds } } });
      await prisma.mention.deleteMany({ where: { chapterId: { in: chapterIds } } });
    }

    await prisma.profile.deleteMany({ where: { bookId } });
    await prisma.mergeSuggestion.deleteMany({ where: { bookId } });
    await prisma.chapter.deleteMany({ where: { bookId } });
    await prisma.book.deleteMany({ where: { id: bookId } });
  }

  if (created.personaIds.length > 0) {
    await prisma.relationship.deleteMany({
      where: {
        OR: [
          { sourceId: { in: created.personaIds } },
          { targetId: { in: created.personaIds } }
        ]
      }
    });
    await prisma.biographyRecord.deleteMany({ where: { personaId: { in: created.personaIds } } });
    await prisma.mention.deleteMany({ where: { personaId: { in: created.personaIds } } });
    await prisma.profile.deleteMany({ where: { personaId: { in: created.personaIds } } });
    await prisma.mergeSuggestion.deleteMany({
      where: {
        OR: [
          { sourcePersonaId: { in: created.personaIds } },
          { targetPersonaId: { in: created.personaIds } }
        ]
      }
    });
    await prisma.persona.deleteMany({ where: { id: { in: created.personaIds } } });
  }

  log("验收数据清理完成");
}

/**
 * 服务就绪探测。
 * 允许短时重试，避免服务刚启动时的瞬时连接失败导致误报。
 */
async function ensureServerReady() {
  log(`检查服务连通性: ${BASE_URL}`);

  for (let attempt = 1; attempt <= 15; attempt += 1) {
    try {
      const result = await request("/");
      if (result.status >= 200 && result.status < 500) {
        // 接受 2xx~4xx：说明服务栈已启动并可响应，哪怕首页可能返回 404/重定向。
        log(`服务已就绪（HTTP ${result.status}）`);
        return;
      }
    } catch {
      // ignore and retry
    }

    await wait(1000);
  }

  throw new Error(`Service is not reachable: ${BASE_URL}`);
}

/**
 * 验收主流程：
 * - 严格按 A -> B -> C -> D -> E 顺序执行；
 * - finally 中无条件清理数据并断开数据库连接。
 */
async function main() {
  log("Phase 12 A-E 严格验收开始");

  try {
    await ensureServerReady();
    const adminCookie = await loginAsAdmin();

    const sceneA = await runSceneA(adminCookie);
    const sceneB = await runSceneB(adminCookie, sceneA.bookId, sceneA.chapterId);
    await runSceneC(adminCookie, sceneA.bookId, sceneA.chapterId, sceneB.targetPersonaId, sceneB.thirdPersonaId);
    await runSceneD(adminCookie);
    await runSceneE(adminCookie);

    log("Phase 12 A-E 全部通过");
  } finally {
    // 清理失败不覆盖主错误：只记录日志，便于保留原始失败原因。
    await cleanupCreatedData().catch((error: unknown) => {
      console.error("[cleanup.failed]", error);
    });
    await prisma.$disconnect();
  }
}

await main().catch((error: unknown) => {
  console.error("\n[FAILED] Phase 12 A-E 验收失败");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
