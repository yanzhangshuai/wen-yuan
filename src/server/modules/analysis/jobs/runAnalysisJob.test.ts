/**
 * 文件定位（v6 分析管线编排器单测）：
 * - 覆盖 runAnalysisJob 的 claim → 快照 → 提取→身份→归并→Pass3-5 → 终态全生命周期编排。
 * - 编排是确定性串联（组件厚 + 管线薄），本测试用 mock Pass 组件验证时序、
 *   取消、落库、重试与冲突扫描接线，不跑真实 LLM。
 *
 * 业务职责：
 * - 锁定硬时序：分片提取→身份 Pass→确定性归并→聚合→自动接受→Pass5；
 * - 验证乐观 claim、取消贯穿、章节重试 2 次、facts 唯一写入口、条件④冲突扫描接线。
 *
 * Mock 策略：
 * - extractor 使用真实实现（管线内动态 import），其唯一外部依赖 callIdentityLlm 打桩，
 *   避免 vi.mock + 并发动态 import 的竞态（vitest 对并发 import() 的 mock 解析不稳定）；
 * - 其余 Pass 组件（identityPass/projection/aggregator/autoAccept/conflictScan/
 *   skillSelector/skillLoader/skillGenerator）走 vi.hoisted + vi.mock；
 * - registry 用部分 mock（保留 normalizeRegistryName 等纯函数，getRegistry 打桩）；
 * - Neo4j 与 prisma 单例整体 mock，测试通过 createAnalysisJobRunner 注入自定义 client。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisJobStatus, AgentRunType } from "@/generated/prisma/enums";
import { createAnalysisJobRunner } from "@/server/modules/analysis/jobs/runAnalysisJob";
import type * as RegistryModule from "@/server/modules/identity/registry";
import type { BookRegistry } from "@/server/modules/identity/registry";
import type * as AutoAcceptModule from "@/server/modules/review/autoAccept";

// ===========================================================================
// vi.hoisted：全部 Pass 组件 mock 提升，供 vi.mock 工厂引用（避免提升期 undefined）
// ===========================================================================
const hoisted = vi.hoisted(() => {
  const callIdentityLlmMock = vi.fn();
  const runIdentityPassMock = vi.fn();
  const runProjectionMock = vi.fn();
  const scanMisattributionMock = vi.fn();
  const acceptFactsForJobMock = vi.fn();
  const refreshRelationshipsForBookMock = vi.fn();
  const skillSelectorMock = { selectSkillsForJob: vi.fn() };
  const skillLoaderMock = { resolveSkillsForJob: vi.fn() };
  const skillGeneratorMock = { generateSkillFromSignals: vi.fn() };
  const getNeo4jDriverMock = vi.fn();
  const getRegistryMock = vi.fn();
  const realAcceptFactsForJob = null as null | ((
    jobId: string,
    client: unknown,
    conflictScan: unknown[]
  ) => Promise<{
    accepted     : string[];
    rejected     : string[];
    rejectReasons: Record<string, string[]>;
  }>);

  return {
    callIdentityLlmMock,
    runIdentityPassMock,
    runProjectionMock,
    scanMisattributionMock,
    acceptFactsForJobMock,
    refreshRelationshipsForBookMock,
    skillSelectorMock,
    skillLoaderMock,
    skillGeneratorMock,
    getNeo4jDriverMock,
    getRegistryMock,
    realAcceptFactsForJob
  };
});

// ---------------------------------------------------------------------------
// vi.mock：替换各 Pass 组件模块（静态 + 动态 import 均命中同一模块注册表）
// ---------------------------------------------------------------------------
// 注意：extractor 不 mock（真实实现），仅 mock 其 LLM 依赖 callIdentityLlm
vi.mock("@/server/modules/identity/llm", () => ({
  callIdentityLlm: hoisted.callIdentityLlmMock
}));

vi.mock("@/server/modules/identity/identityPass", () => ({
  runIdentityPass: hoisted.runIdentityPassMock
}));

vi.mock("@/server/modules/identity/projection", () => ({
  runProjection: hoisted.runProjectionMock
}));

vi.mock("@/server/modules/identity/conflictScan", () => ({
  scanMisattribution         : hoisted.scanMisattributionMock,
  scanCandidateMisattribution: vi.fn()
}));

// autoAccept 部分 mock：捕获真实 acceptFactsForJob 供条件④用例复用
vi.mock("@/server/modules/review/autoAccept", async (importOriginal) => {
  const actual = await importOriginal<typeof AutoAcceptModule>();
  hoisted.realAcceptFactsForJob = actual.acceptFactsForJob as unknown as typeof hoisted.realAcceptFactsForJob;
  return {
    ...actual,
    acceptFactsForJob: hoisted.acceptFactsForJobMock
  };
});

vi.mock("@/server/modules/extraction/aggregator", () => ({
  refreshRelationshipsForBook: hoisted.refreshRelationshipsForBookMock
}));

// registry 部分 mock：保留 normalizeRegistryName 等纯函数，getRegistry 打桩
vi.mock("@/server/modules/identity/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof RegistryModule>();
  return {
    ...actual,
    getRegistry: hoisted.getRegistryMock
  };
});

vi.mock("@/server/modules/skills/skillSelector", () => ({
  skillSelector: hoisted.skillSelectorMock
}));

vi.mock("@/server/modules/skills/loader", () => ({
  skillLoader: hoisted.skillLoaderMock
}));

vi.mock("@/server/modules/skills/skillGenerator", () => ({
  skillGenerator: hoisted.skillGeneratorMock
}));

vi.mock("@/server/db/neo4j", () => ({
  getNeo4jDriver: hoisted.getNeo4jDriverMock
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {}
}));

// ===========================================================================
// Fixtures
// ===========================================================================
const BOOK_ID = "book-1";
const JOB_ID = "job-1";
const BOOK_SUMMARY_MAX_CHARS = 2000;

/** 任务快照中的关系码契约（relationshipTypesSnapshot）。 */
const SNAPSHOT = [
  { code: "父子", direction: "SYMMETRIC" as const, category: "familial" }
];

/**
 * 生成 count 个章节 ref（按 no 升序）。
 * 正文含"范进/周进/李老爷"，供真实 runGuardrails 证据锚定通过。
 */
function makeChapters(count: number): Array<{ id: string; no: number; title: string; content: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id     : `ch-${i + 1}`,
    no     : i + 1,
    title  : `第${i + 1}回`,
    content: `正文第${i + 1}回：范进周进李老爷同场议事……`
  }));
}

/** 常规登记表：两个实体（范进 HIGH / 周进 MEDIUM），供 Pass0-5 数据准备消费。 */
const REGISTRY: BookRegistry = {
  bookId  : BOOK_ID,
  loadedAt: new Date(),
  entries : [
    {
      entityId              : "ent-1",
      canonical             : "范进",
      type                  : "PERSON",
      aliases               : ["范老爷", "范举人"],
      confidenceTier        : "HIGH",
      activeChapters        : [1, 2, 3],
      firstAppearanceChapter: 1,
      nameType              : "NAMED"
    },
    {
      entityId              : "ent-2",
      canonical             : "周进",
      type                  : "PERSON",
      aliases               : ["周老爷"],
      confidenceTier        : "MEDIUM",
      activeChapters        : [2],
      firstAppearanceChapter: 2,
      nameType              : "NAMED"
    }
  ]
};

/** 条件④用例专用登记表：两个实体均为 HIGH（其余四条件可全过，只留冲突拒绝）。 */
const HIGH_REGISTRY: BookRegistry = {
  bookId  : BOOK_ID,
  loadedAt: new Date(),
  entries : [
    {
      entityId              : "ent-1",
      canonical             : "范进",
      type                  : "PERSON",
      aliases               : ["范老爷"],
      confidenceTier        : "HIGH",
      activeChapters        : [1, 2],
      firstAppearanceChapter: 1,
      nameType              : "NAMED"
    },
    {
      entityId              : "ent-2",
      canonical             : "周进",
      type                  : "PERSON",
      aliases               : ["周老爷"],
      confidenceTier        : "HIGH",
      activeChapters        : [2],
      firstAppearanceChapter: 2,
      nameType              : "NAMED"
    }
  ]
};

/** Pass5 信号采集用例登记表：含一个 TITLE_ONLY MEDIUM 高频称谓（触发 skillGenerator）。 */
const REGISTRY_WITH_TITLE: BookRegistry = {
  bookId  : BOOK_ID,
  loadedAt: new Date(),
  entries : [
    {
      entityId              : "ent-1",
      canonical             : "范进",
      type                  : "PERSON",
      aliases               : ["范老爷"],
      confidenceTier        : "HIGH",
      activeChapters        : [1],
      firstAppearanceChapter: 1,
      nameType              : "NAMED"
    },
    {
      entityId              : "ent-2",
      canonical             : "老爷",
      type                  : "PERSON",
      aliases               : [],
      confidenceTier        : "MEDIUM",
      activeChapters        : [1, 2, 3],
      firstAppearanceChapter: 1,
      nameType              : "TITLE_ONLY"
    }
  ]
};

/**
 * 默认提取 JSON（callIdentityLlm 返回 data）。
 * 经真实 runGuardrails 后产出：RELATION(范进→周进,父子) + BIOGRAPHY(范进,EVENT)。
 * 新人物 不在登记表 → persistSliceFacts 兜底创建实体。
 */
const LLM_EXTRACTION = {
  entities: [
    { canonical: "范进", type: "PERSON" as const, aliases: ["范老爷"] },
    { canonical: "新人物", type: "PERSON" as const }
  ],
  relations: [
    { typeCode: "父子", sourceCanonical: "范进", targetCanonical: "周进", evidence: "范进与周进同场" }
  ],
  bioFacts: [
    { category: "EVENT" as const, subjectCanonical: "范进", summary: "中举", evidence: "范进中举" }
  ]
};

/** 空提取 JSON：Pass3 多实体组跳过用例（避免 Pass1 别名落库干扰断言）。 */
const EMPTY_EXTRACTION = {
  entities : [],
  relations: [],
  bioFacts : []
};

/** 条件④冲突扫描 flag：范老爷 被标记误归属，当前绑定 ent-1。 */
const FLAG = {
  alias                : "范老爷",
  currentEntityId      : "ent-1",
  targetEntityId       : "ent-9",
  aliasActiveChapters  : [2, 3],
  currentEntityChapters: [1, 2],
  targetEntityChapters : [2, 3],
  confidence           : 0.8
};

/** 待审 DRAFT fact：其余四条件全过，仅条件④被冲突扫描命中。 */
const REVIEW_FACT = {
  id                  : "fact-dirty",
  sourceEntityId      : "ent-1",
  targetEntityId      : "ent-2",
  relationshipTypeCode: null,
  evidence            : "范进……周进……",
  chapter             : { content: "范进……周进……" },
  sourceEntity        : { name: "范进", aliases: ["范老爷"] },
  targetEntity        : { name: "周进", aliases: ["周老爷"] }
};

// ===========================================================================
// Mock Prisma client（覆盖管线用到的全部方法）
// ===========================================================================
function createMockPrisma() {
  return {
    $transaction   : vi.fn(),
    analysisJob    : { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    book           : { findUnique: vi.fn(), update: vi.fn() },
    chapter        : { findMany: vi.fn(), updateMany: vi.fn() },
    agentRun       : { create: vi.fn(), update: vi.fn() },
    entity         : { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    entityProfile  : { create: vi.fn(), findMany: vi.fn() },
    alias          : { findFirst: vi.fn(), create: vi.fn() },
    agentWriteAudit: { create: vi.fn() },
    fact           : { create: vi.fn(), findMany: vi.fn() },
    mention        : { create: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    relationship   : { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    skill          : { findMany: vi.fn() }
  };
}
type MockPrisma = ReturnType<typeof createMockPrisma>;

// ===========================================================================
// 配置辅助
// ===========================================================================
interface HappyPathOptions {
  chapters?  : ReturnType<typeof makeChapters>;
  registry?  : BookRegistry;
  snapshot?  : unknown;
  /** 轮询取消标志：返回 true 时 isJobCanceled 命中 CANCELED。 */
  isCanceled?: () => boolean;
}

/** 配置 Pass 组件 mock 的默认实现（每次 beforeEach 重建）。 */
function configurePassMocks(): void {
  hoisted.skillSelectorMock.selectSkillsForJob.mockResolvedValue(undefined);
  hoisted.skillLoaderMock.resolveSkillsForJob.mockResolvedValue({
    skills: [
      {
        slug       : "s",
        name       : "S",
        description: null,
        category   : "GENERIC_TITLE",
        versionNo  : 1,
        metadata   : { triggers: { priority: 1 } },
        markdown   : "# 技能\n\n内容"
      }
    ],
    summary    : [],
    deicticJunk: [],
    loadedAt   : new Date().toISOString()
  });
  hoisted.callIdentityLlmMock.mockResolvedValue({ data: LLM_EXTRACTION });
  hoisted.runIdentityPassMock.mockResolvedValue({ groups: [], dropped: [], surfaceForms: [] });
  hoisted.runProjectionMock.mockResolvedValue({ retained: 0, absorbed: 0, repointed: 0 });
  hoisted.scanMisattributionMock.mockResolvedValue([]);
  hoisted.acceptFactsForJobMock.mockResolvedValue({ accepted: [], rejected: [], rejectReasons: {} });
  hoisted.refreshRelationshipsForBookMock.mockResolvedValue([]);
  hoisted.skillGeneratorMock.generateSkillFromSignals.mockResolvedValue({ skillId: "skill-1", slug: "gen-1", status: "DRAFT" });
  hoisted.getRegistryMock.mockResolvedValue(REGISTRY);
}

/** 配置 mock prisma 的成功路径默认实现（每个用例可再覆盖特定方法）。 */
function configureHappyPath(mockPrisma: MockPrisma, options: HappyPathOptions = {}): void {
  const chapters = options.chapters ?? makeChapters(6);
  const snapshot = options.snapshot ?? SNAPSHOT;

  // 终态事务：数组形式顺序执行（writeTerminalState 使用）
  mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => {
    for (const op of ops) {
      await op;
    }
  });

  // claim 乐观抢占成功
  mockPrisma.analysisJob.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.analysisJob.update.mockResolvedValue({ id: JOB_ID });

  // findUnique 按 select 区分三种形状：状态轮询 / 快照读取 / job 上下文
  mockPrisma.analysisJob.findUnique.mockImplementation(async (args: { select?: Record<string, boolean> }) => {
    const select = args.select ?? {};
    if (select.status !== undefined) {
      const status = options.isCanceled
        ? options.isCanceled() ? AnalysisJobStatus.CANCELED : AnalysisJobStatus.RUNNING
        : AnalysisJobStatus.RUNNING;
      return { status };
    }
    if (select.relationshipTypesSnapshot !== undefined) {
      return { id: JOB_ID, bookId: BOOK_ID, relationshipTypesSnapshot: snapshot };
    }
    return {
      id            : JOB_ID,
      bookId        : BOOK_ID,
      scope         : "FULL_BOOK",
      chapterStart  : null,
      chapterEnd    : null,
      chapterIndices: []
    };
  });

  mockPrisma.chapter.findMany.mockResolvedValue(chapters);
  mockPrisma.chapter.updateMany.mockResolvedValue({ count: chapters.length });
  mockPrisma.book.findUnique.mockResolvedValue({ id: BOOK_ID, title: "儒林外史", description: "讽刺小说" });
  mockPrisma.book.update.mockResolvedValue({ id: BOOK_ID });

  mockPrisma.agentRun.create.mockImplementation(async (args: { data: { runType: string } }) => ({ id: `run-${args.data.runType}` }));
  mockPrisma.agentRun.update.mockResolvedValue({ id: "run-1" });

  // 实体：默认 DB 未命中（走创建兜底）；mention.groupBy 默认无孤儿
  mockPrisma.entity.findFirst.mockResolvedValue(null);
  mockPrisma.entity.create.mockImplementation(async (args: { data: { name: string } }) => ({ id: `new-${args.data.name}` }));
  mockPrisma.entityProfile.create.mockResolvedValue({ id: "profile-1" });
  mockPrisma.entity.findMany.mockResolvedValue([]);
  mockPrisma.entity.updateMany.mockResolvedValue({ count: 0 });

  mockPrisma.alias.findFirst.mockResolvedValue(null);
  mockPrisma.alias.create.mockResolvedValue({ id: "alias-1" });
  mockPrisma.agentWriteAudit.create.mockResolvedValue({ id: "audit-1" });

  mockPrisma.fact.create.mockImplementation(async (args: { data: { chapterNo: number } }) => ({ id: `fact-${args.data.chapterNo}` }));
  mockPrisma.fact.findMany.mockResolvedValue([]);
  mockPrisma.mention.create.mockResolvedValue({ id: "mention-1" });
  mockPrisma.mention.groupBy.mockResolvedValue([]);
  mockPrisma.mention.count.mockResolvedValue(5);

  // Neo4j 默认未启用：静默跳过图同步
  hoisted.getNeo4jDriverMock.mockReturnValue(null);
}

// ===========================================================================
// 测试主体
// ===========================================================================
describe("runAnalysisJob", () => {
  let mockPrisma: MockPrisma;
  let runner: ReturnType<typeof createAnalysisJobRunner>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    configureHappyPath(mockPrisma);
    configurePassMocks();
    runner = createAnalysisJobRunner(mockPrisma as never);
  });

  describe("生命周期", () => {
    // 用例语义：claim 抢到后执行全管线，终态 SUCCEEDED + book COMPLETED。
    it("claim 抢到后执行全管线，落 SUCCEEDED + book COMPLETED 终态", async () => {
      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: claim 乐观抢占（QUEUED→RUNNING）+ 章节重置 PENDING + book PROCESSING
      expect(mockPrisma.analysisJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: JOB_ID, status: AnalysisJobStatus.QUEUED },
        data : expect.objectContaining({ status: AnalysisJobStatus.RUNNING })
      }));
      expect(mockPrisma.chapter.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: { parseStatus: "PENDING" }
      }));
      expect(mockPrisma.book.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: "PROCESSING", errorLog: null }
      }));

      // Assert: 任务启动快照（selectSkillsForJob 落库 + 装载从快照读）
      expect(hoisted.skillSelectorMock.selectSkillsForJob).toHaveBeenCalledWith({ bookId: BOOK_ID, jobId: JOB_ID });
      expect(hoisted.skillLoaderMock.resolveSkillsForJob).toHaveBeenCalledWith(JOB_ID);
      // 关系码契约来自任务快照，注入提取 prompt（片间不漂移）
      expect(hoisted.callIdentityLlmMock).toHaveBeenCalledWith(expect.objectContaining({
        stage: "INDEPENDENT_EXTRACTION",
        jobId: JOB_ID
      }));
      const extractUser = hoisted.callIdentityLlmMock.mock.calls[0][0].user as string;
      expect(extractUser).toContain("可选关系码：父子");

      // Assert: 全链路 agent_runs 留痕（各 runType；v6 无 RECONCILE）
      for (const runType of [AgentRunType.EXTRACTION, AgentRunType.IDENTITY, AgentRunType.VALIDATION, AgentRunType.SKILL_GENERATION]) {
        expect(mockPrisma.agentRun.create).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ runType })
        }));
      }

      // Assert: 终态 SUCCEEDED + book COMPLETED
      expect(mockPrisma.analysisJob.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
      }));
      expect(mockPrisma.book.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" })
      }));
    });

    // 用例语义：乐观并发下被其他 runner 抢占，本进程直接返回不执行管线。
    it("claim 未抢到（count=0）时直接返回，不执行管线", async () => {
      // Arrange
      mockPrisma.analysisJob.updateMany.mockResolvedValue({ count: 0 });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 未加载上下文、未跑任何 Pass、未写终态
      expect(mockPrisma.analysisJob.findUnique).not.toHaveBeenCalled();
      expect(hoisted.runIdentityPassMock).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    // 用例语义：job 不存在时无法定位 book，直接落 FAILED 终态（bookId 为空）。
    it("job 不存在时 writeTerminalState 失败分支（bookId 为空）", async () => {
      // Arrange: loadJobContext 形状（无 status / 无 snapshot）返回 null
      mockPrisma.analysisJob.findUnique.mockImplementation(async (args: { select?: Record<string, boolean> }) => {
        const select = args.select ?? {};
        if (select.status !== undefined) {
          return { status: AnalysisJobStatus.RUNNING };
        }
        if (select.relationshipTypesSnapshot !== undefined) {
          return { id: JOB_ID, bookId: BOOK_ID, relationshipTypesSnapshot: SNAPSHOT };
        }
        return null;
      });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 未跑管线，job FAILED + book ERROR
      expect(hoisted.runIdentityPassMock).not.toHaveBeenCalled();
      expect(mockPrisma.analysisJob.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: JOB_ID },
        data : expect.objectContaining({ status: AnalysisJobStatus.FAILED })
      }));
      expect(mockPrisma.book.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "ERROR" })
      }));
    });

    // 用例语义：runNextAnalysisJob 复用 runAnalysisJobById（恢复调度入口）。
    it("runNextAnalysisJob 复用 runAnalysisJobById（恢复调度入口）", async () => {
      // Act
      await runner.runNextAnalysisJob(JOB_ID);

      // Assert: 与 runAnalysisJobById 走同一执行路径
      expect(hoisted.runIdentityPassMock).toHaveBeenCalled();
      expect(mockPrisma.analysisJob.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
      }));
    });
  });

  describe("编排时序", () => {
    // 用例语义：v6 硬时序 提取→身份→归并→聚合→自动接受，归并在身份后、聚合前。
    it("按 v6 时序调用：提取→身份→归并→聚合→冲突扫描→自动接受", async () => {
      // Arrange: 各 Pass 组件按调用顺序记录
      const order: string[] = [];
      hoisted.callIdentityLlmMock.mockImplementation(async () => { order.push("extract"); return { data: LLM_EXTRACTION }; });
      hoisted.runIdentityPassMock.mockImplementation(async () => { order.push("identity"); return { groups: [], dropped: [], surfaceForms: [] }; });
      hoisted.runProjectionMock.mockImplementation(async () => { order.push("project"); return { retained: 0, absorbed: 0, repointed: 0 }; });
      hoisted.refreshRelationshipsForBookMock.mockImplementation(async () => { order.push("refresh"); return []; });
      hoisted.scanMisattributionMock.mockImplementation(async () => { order.push("scan"); return []; });
      hoisted.acceptFactsForJobMock.mockImplementation(async () => { order.push("accept"); return { accepted: [], rejected: [], rejectReasons: {} }; });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 提取→身份→归并→聚合→冲突扫描→自动接受 严格先后
      expect(order.indexOf("extract")).toBeLessThan(order.indexOf("identity"));
      expect(order.indexOf("identity")).toBeLessThan(order.indexOf("project"));
      expect(order.indexOf("project")).toBeLessThan(order.indexOf("refresh"));
      expect(order.indexOf("refresh")).toBeLessThan(order.indexOf("scan"));
      expect(order.indexOf("scan")).toBeLessThan(order.indexOf("accept"));
      // Pass5 markOrphan 在自动接受之后（mention.groupBy 由 markOrphan 触发）
      expect(mockPrisma.mention.groupBy).toHaveBeenCalled();
    });

    // 用例语义：目标章节为空是非法输入，直接落 FAILED 终态。
    it("目标章节为空时抛错并落 FAILED 终态", async () => {
      // Arrange
      configureHappyPath(mockPrisma, { chapters: [] });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 未进入快照与 Pass0，job FAILED
      expect(hoisted.skillSelectorMock.selectSkillsForJob).not.toHaveBeenCalled();
      expect(hoisted.runIdentityPassMock).not.toHaveBeenCalled();
      expect(mockPrisma.analysisJob.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: AnalysisJobStatus.FAILED })
      }));
    });
  });

  describe("取消", () => {
    // 用例语义：Pass 之间检测到取消，跳过终态写入保留 CANCELED。
    it("Pass 之间检测到取消时跳过终态写入，保留 CANCELED 状态", async () => {
      // Arrange: 提取完成后置取消标志，下一个检查点（身份 Pass 前）中断
      let canceled = false;
      hoisted.callIdentityLlmMock.mockImplementation(async () => {
        canceled = true;
        return { data: LLM_EXTRACTION };
      });
      configureHappyPath(mockPrisma, { isCanceled: () => canceled });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 身份 Pass 及后续 Pass 未执行，终态未写入（不覆盖 CANCELED）
      expect(hoisted.runIdentityPassMock).not.toHaveBeenCalled();
      expect(hoisted.refreshRelationshipsForBookMock).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      // 仅允许 setStage 阶段写入；不允许任何带 status 的终态更新覆盖 CANCELED。
      expect(mockPrisma.analysisJob.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: expect.anything() })
        })
      );
    });
  });

  describe("落库 persistSliceFacts", () => {
    // 用例语义：提取结果按解析后的 entityId 落库 facts/mentions/aliases/审计。
    it("提取结果按解析后的 entityId 落库 facts/mentions/aliases/审计", async () => {
      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: v6 提取无登记表 → RELATION fact 以临时实体 entityId 写入（ensureEntityByName 兜底创建）
      expect(mockPrisma.fact.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          factType            : "RELATION",
          sourceEntityId      : "new-范进",
          targetEntityId      : "new-周进",
          relationshipTypeCode: "父子",
          status              : "DRAFT",
          recordSource        : "DRAFT_AI",
          jobId               : JOB_ID
        })
      }));
      // 全部实体由 ensureEntityByName 兜底创建（无登记表命中）
      expect(mockPrisma.entity.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ name: "新人物" })
      }));
      // 片内别名注册到临时实体
      expect(mockPrisma.alias.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ entityId: "new-范进", alias: "范老爷" })
      }));
      // 提及 + 写审计留痕
      expect(mockPrisma.mention.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ entityId: "new-范进", rawText: "范进", recordSource: "DRAFT_AI" })
      }));
      expect(mockPrisma.agentWriteAudit.create).toHaveBeenCalled();
    });

    // 用例语义：护栏丢弃记录以 REJECT 审计留痕（非法关系码）。
    it("护栏丢弃记录留 REJECT 审计（非法关系码）", async () => {
      // Arrange: 提取含契约外关系码（师徒），被 runGuardrails 丢弃
      hoisted.callIdentityLlmMock.mockResolvedValue({
        data: {
          ...LLM_EXTRACTION,
          relations: [
            ...LLM_EXTRACTION.relations,
            { typeCode: "师徒", sourceCanonical: "范进", targetCanonical: "周进", evidence: "范进拜周进为师" }
          ]
        }
      });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 丢弃记录以 REJECT + guardrail 审计留痕
      expect(mockPrisma.agentWriteAudit.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: "REJECT", reason: "guardrail" })
      }));
    });

    // 用例语义：entityId 未命中时 DB 回退复用已有实体，alias 已存在时跳过创建。
    it("entityId 未命中时 DB 回退复用已有实体，alias 已存在时跳过创建", async () => {
      // Arrange: 提取含登记表外名字 + DB 已存在同名实体 + 别名已存在
      hoisted.callIdentityLlmMock.mockResolvedValue({
        data: {
          entities : [],
          relations: [
            { typeCode: "父子", sourceCanonical: "李老爷", targetCanonical: "范进", evidence: "李老爷与范进同场" }
          ],
          bioFacts: []
        }
      });
      mockPrisma.entity.findFirst.mockResolvedValue({ id: "ent-db", profiles: [{ id: "p1" }] });
      mockPrisma.alias.findFirst.mockResolvedValue({ id: "alias-existing" });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 复用 DB 实体（不新建），fact 落到 ent-db；别名跳过创建
      expect(mockPrisma.entity.create).not.toHaveBeenCalled();
      expect(mockPrisma.fact.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ sourceEntityId: "ent-db" })
      }));
      expect(mockPrisma.alias.create).not.toHaveBeenCalled();
    });
  });

  describe("重试", () => {
    // 用例语义：单片提取失败 2 次后成功，attempt 递增且不标记章节 FAILED。
    it("单片提取失败 2 次后成功 → attempt 递增且不标记章节 FAILED", async () => {
      // Arrange: 单片（3 章），前 2 次抛错第 3 次成功
      configureHappyPath(mockPrisma, { chapters: makeChapters(3) });
      let call = 0;
      hoisted.callIdentityLlmMock.mockImplementation(async () => {
        call += 1;
        if (call <= 2) {
          throw new Error(`attempt ${call} failed`);
        }
        return { data: LLM_EXTRACTION };
      });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 共尝试 3 次（2 次重试触发 attempt 递增）；不标记章节 FAILED
      expect(hoisted.callIdentityLlmMock).toHaveBeenCalledTimes(3);
      expect(mockPrisma.analysisJob.update).toHaveBeenCalledWith({ where: { id: JOB_ID }, data: { attempt: { increment: 1 } } });
      expect(mockPrisma.chapter.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({
        data: { parseStatus: "FAILED" }
      }));
      // 终态 SUCCEEDED
      expect(mockPrisma.analysisJob.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
      }));
    });

    // 用例语义：单片提取耗尽 3 次，标记失败章节 + 任务 FAILED。
    it("单片提取耗尽 3 次 → 标记章节 FAILED + 任务 FAILED", async () => {
      // Arrange: 单片，所有尝试均抛错
      configureHappyPath(mockPrisma, { chapters: makeChapters(3) });
      hoisted.callIdentityLlmMock.mockRejectedValue(new Error("llm down"));

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 3 次尝试 + 章节 FAILED + 任务 FAILED + book ERROR
      expect(hoisted.callIdentityLlmMock).toHaveBeenCalledTimes(3);
      expect(mockPrisma.chapter.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: { parseStatus: "FAILED" }
      }));
      expect(mockPrisma.analysisJob.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: AnalysisJobStatus.FAILED })
      }));
      expect(mockPrisma.book.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: "ERROR" })
      }));
    });

    // 用例语义：部分分片失败时，已成功分片仍落库，任务终态 FAILED。
    it("部分分片失败时已成功分片仍落库，任务终态 FAILED", async () => {
      // Arrange: 两片（7 章），第二片（第7回正文）LLM 稳定失败，第一片成功。
      // 注意：仅按"章节正文"段判别（全书摘要结尾含第7回内容，不能用整段 user）
      configureHappyPath(mockPrisma, { chapters: makeChapters(7) });
      hoisted.callIdentityLlmMock.mockImplementation(async (input: { user: string }) => {
        const sliceText = input.user.split("章节正文：")[1].split("\n\n全书摘要：")[0];
        if (sliceText.includes("第7回")) {
          throw new Error("slice 2 failed");
        }
        return { data: LLM_EXTRACTION };
      });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 第一片成功落库（fact.create 被调用），第二片重试耗尽 → 任务 FAILED
      expect(mockPrisma.fact.create).toHaveBeenCalled();
      expect(mockPrisma.chapter.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        data: { parseStatus: "FAILED" }
      }));
      expect(mockPrisma.analysisJob.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: AnalysisJobStatus.FAILED })
      }));
    });

    // 用例语义：分片提取并发上限 3（Promise.all 分批，每批 ≤3）。
    it("分片提取并发数不超过 3", async () => {
      // Arrange: 20 章 → 4 片（6/6/6/2），两批
      configureHappyPath(mockPrisma, { chapters: makeChapters(20) });
      let active = 0;
      let maxActive = 0;
      hoisted.callIdentityLlmMock.mockImplementation(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { data: LLM_EXTRACTION };
      });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 4 片全部提取，峰值并发 ≤3 且发生过并发（>1）
      expect(hoisted.callIdentityLlmMock).toHaveBeenCalledTimes(4);
      expect(maxActive).toBeLessThanOrEqual(3);
      expect(maxActive).toBeGreaterThan(1);
    });
  });

  describe("条件④ 冲突扫描接线", () => {
    // 用例语义：管线把全量 scanMisattribution 结果接入 acceptFactsForJob，被标记实体的事实被拒。
    it("scanMisattribution 标记的实体其 fact 在 acceptFactsForJob 中被拒（conflict_dirty）", async () => {
      // Arrange: 使用真实 acceptFactsForJob，其余四条件全过，仅条件④命中冲突
      hoisted.getRegistryMock.mockResolvedValue(HIGH_REGISTRY);
      hoisted.scanMisattributionMock.mockResolvedValue([FLAG]);
      const realAccept = hoisted.realAcceptFactsForJob;
      if (!realAccept) {
        throw new Error("vi.mock 工厂未捕获真实 acceptFactsForJob");
      }
      hoisted.acceptFactsForJobMock.mockImplementation(realAccept);
      mockPrisma.fact.findMany.mockResolvedValue([REVIEW_FACT]);

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 管线把冲突扫描结果作为第三参传给自动接受栈
      expect(hoisted.scanMisattributionMock).toHaveBeenCalled();
      expect(hoisted.acceptFactsForJobMock.mock.calls[0]).toEqual([JOB_ID, mockPrisma, [FLAG]]);
      // Assert: 被 flag 实体的 fact 被拒，rejectReason 含 conflict_dirty
      const result = await hoisted.acceptFactsForJobMock.mock.results[0].value as {
        accepted     : string[];
        rejected     : string[];
        rejectReasons: Record<string, string[]>;
      };
      expect(result.rejected).toContain("fact-dirty");
      expect(result.rejectReasons["fact-dirty"]).toContain("conflict_dirty");
    });
  });

  describe("Pass5 / markOrphan / skillGenerator / Neo4j", () => {
    // 用例语义：FULL_BOOK 下 markOrphan 降级孤儿实体，高频称谓信号触发技能生成。
    it("FULL_BOOK 下 markOrphan 降级孤儿实体 + 有信号时生成 DRAFT 技能", async () => {
      // Arrange: 登记表含 TITLE_ONLY 高频称谓；ent-2 无 mention（孤儿）
      hoisted.getRegistryMock.mockResolvedValue(REGISTRY_WITH_TITLE);
      mockPrisma.mention.groupBy.mockResolvedValue([{ entityId: "ent-1", _count: { _all: 3 } }]);
      mockPrisma.entity.findMany.mockResolvedValue([{ id: "ent-1" }, { id: "ent-2" }]);
      mockPrisma.entity.updateMany.mockResolvedValue({ count: 1 });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: mention<2 的实体置信度降级为 0.4
      expect(mockPrisma.entity.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["ent-2"] } }),
        data : { confidence: 0.4 }
      }));
      // Assert: 高频称谓信号 → skillGenerator 生成 DRAFT 候选
      expect(hoisted.skillGeneratorMock.generateSkillFromSignals).toHaveBeenCalledWith(
        expect.objectContaining({ bookId: BOOK_ID, frequentTitles: ["老爷"] })
      );
    });

    // 用例语义：非 FULL_BOOK scope 跳过 markOrphan。
    it("非 FULL_BOOK scope 跳过 markOrphan，且按 no 区间选章", async () => {
      // Arrange: loadJobContext 返回 CHAPTER_RANGE scope（no ∈ [2,5]）
      mockPrisma.analysisJob.findUnique.mockImplementation(async (args: { select?: Record<string, boolean> }) => {
        const select = args.select ?? {};
        if (select.status !== undefined) {
          return { status: AnalysisJobStatus.RUNNING };
        }
        if (select.relationshipTypesSnapshot !== undefined) {
          return { id: JOB_ID, bookId: BOOK_ID, relationshipTypesSnapshot: SNAPSHOT };
        }
        return {
          id            : JOB_ID,
          bookId        : BOOK_ID,
          scope         : "CHAPTER_RANGE",
          chapterStart  : 2,
          chapterEnd    : 5,
          chapterIndices: []
        };
      });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 按 no ∈ [2,5] 选章；非 FULL_BOOK 跳过 markOrphan；任务仍 SUCCEEDED
      expect(mockPrisma.chapter.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ no: { gte: 2, lte: 5 } })
      }));
      expect(mockPrisma.mention.groupBy).not.toHaveBeenCalled();
      expect(mockPrisma.analysisJob.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
      }));
    });

    // 用例语义：CHAPTER_LIST scope 按 no 列表选章。
    it("CHAPTER_LIST scope 按 no 列表选章", async () => {
      // Arrange: loadJobContext 返回 CHAPTER_LIST scope
      mockPrisma.analysisJob.findUnique.mockImplementation(async (args: { select?: Record<string, boolean> }) => {
        const select = args.select ?? {};
        if (select.status !== undefined) {
          return { status: AnalysisJobStatus.RUNNING };
        }
        if (select.relationshipTypesSnapshot !== undefined) {
          return { id: JOB_ID, bookId: BOOK_ID, relationshipTypesSnapshot: SNAPSHOT };
        }
        return {
          id            : JOB_ID,
          bookId        : BOOK_ID,
          scope         : "CHAPTER_LIST",
          chapterStart  : null,
          chapterEnd    : null,
          chapterIndices: [1, 3]
        };
      });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: no IN [1,3] 选章
      expect(mockPrisma.chapter.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ no: { in: [1, 3] } })
      }));
    });

    // 用例语义：无信号时不调用 skillGenerator（避免空生成抛错）。
    it("无信号时不调用 skillGenerator", async () => {
      // Act: 默认 REGISTRY 无 TITLE_ONLY 高频、fact.findMany 为空 → 无信号
      await runner.runAnalysisJobById(JOB_ID);

      // Assert
      expect(hoisted.skillGeneratorMock.generateSkillFromSignals).not.toHaveBeenCalled();
    });

    // 用例语义：字典外关系码触发技能生成；快照缺失时关系码视为全量未知。
    it("字典外关系码信号触发 skillGenerator，快照缺失时视为全量未知", async () => {
      // Arrange: fact 含契约外关系码 + 任务快照为 null
      mockPrisma.fact.findMany.mockResolvedValue([
        { relationshipTypeCode: "新关系" },
        { relationshipTypeCode: "父子" }
      ]);
      mockPrisma.analysisJob.findUnique.mockImplementation(async (args: { select?: Record<string, boolean> }) => {
        const select = args.select ?? {};
        if (select.status !== undefined) {
          return { status: AnalysisJobStatus.RUNNING };
        }
        if (select.relationshipTypesSnapshot !== undefined) {
          return null;
        }
        return {
          id            : JOB_ID,
          bookId        : BOOK_ID,
          scope         : "FULL_BOOK",
          chapterStart  : null,
          chapterEnd    : null,
          chapterIndices: []
        };
      });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 快照缺失 → validCodes 空 → 父子/新关系 均入未知码信号
      expect(hoisted.skillGeneratorMock.generateSkillFromSignals).toHaveBeenCalledWith(
        expect.objectContaining({ unknownRelationshipCodes: ["新关系", "父子"] })
      );
    });

    // 用例语义：Neo4j 未配置时静默跳过图同步（保 findPersonaPath PG 回退）。
    it("Neo4j 未配置时静默跳过图同步", async () => {
      // Act: getNeo4jDriverMock 默认返回 null
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: refreshRelationshipsForBook 仍执行，但未建 session
      expect(hoisted.refreshRelationshipsForBookMock).toHaveBeenCalledWith(BOOK_ID, mockPrisma);
      expect(hoisted.getNeo4jDriverMock).toHaveBeenCalled();
    });

    // 用例语义：Neo4j 已配置时全量重同步节点与边（含补查缺名实体）。
    it("Neo4j 已配置时全量重同步节点与边（含补查缺名实体）", async () => {
      // Arrange: 假 driver，3 次写（MERGE 节点 / 删边 / MERGE 边）
      const sessionRun = vi.fn().mockResolvedValue({ records: [] });
      const sessionClose = vi.fn().mockResolvedValue(undefined);
      hoisted.getNeo4jDriverMock.mockReturnValue({ session: () => ({ run: sessionRun, close: sessionClose }) });
      mockPrisma.relationship.findMany.mockResolvedValue([
        { id: "rel-1", sourceEntityId: "ent-1", targetEntityId: "ent-2", relationshipTypeCode: "父子", firstChapterId: "ch-1", firstChapterNo: 1 },
        { id: "rel-2", sourceEntityId: "ent-1", targetEntityId: "ent-99", relationshipTypeCode: "师徒", firstChapterId: null, firstChapterNo: null }
      ]);
      mockPrisma.entityProfile.findMany.mockResolvedValue([
        { entity: { id: "ent-1", name: "范进" } },
        { entity: { id: "ent-2", name: "周进" } }
      ]);
      // 关系边引用无档案实体 → 补查名字避免节点缺名
      mockPrisma.entity.findMany.mockResolvedValue([{ id: "ent-99", name: "师爷" }]);

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 节点 MERGE 含补查实体；边全删重建后写入 2 条边；session 关闭
      expect(sessionRun).toHaveBeenCalledTimes(3);
      expect(sessionRun.mock.calls[0][1].personas).toContainEqual({ id: "ent-99", name: "师爷" });
      expect(sessionRun.mock.calls[2][1].edges).toHaveLength(2);
      expect(sessionClose).toHaveBeenCalled();
    });
  });

  describe("Pass3 别名合并", () => {
    // 用例语义：别名合并的多实体组跳过 ensureAlias（合并决策交人审）。
    it("Pass3 多实体别名组合并后跳过 ensureAlias（交人审）", async () => {
      // Arrange: 两个实体共享同一别名 → Union-Find 合并为多实体组
      hoisted.getRegistryMock.mockResolvedValue({
        bookId  : BOOK_ID,
        loadedAt: new Date(),
        entries : [
          { entityId: "ent-1", canonical: "范进", type: "PERSON", aliases: ["范老爷"], confidenceTier: "HIGH", activeChapters: [1], firstAppearanceChapter: 1, nameType: "NAMED" },
          { entityId: "ent-2", canonical: "范老爷", type: "PERSON", aliases: ["范老爷"], confidenceTier: "LOW", activeChapters: [1], firstAppearanceChapter: 1, nameType: "NAMED" }
        ]
      });
      // 空提取：避免 Pass1 别名落库干扰断言
      hoisted.callIdentityLlmMock.mockResolvedValue({ data: EMPTY_EXTRACTION });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 合并组 entityIds.length !== 1 → 跳过 ensureAlias（不创建任何别名）
      expect(mockPrisma.alias.create).not.toHaveBeenCalled();
    });

    // 用例语义：别名等于 canonical 时跳过注册（persist 与 Pass3 均不重复登记）。
    it("实体别名等于 canonical 时跳过别名注册", async () => {
      // Arrange: 登记表与提取片均含 canonical 同名别名
      hoisted.getRegistryMock.mockResolvedValue({
        bookId  : BOOK_ID,
        loadedAt: new Date(),
        entries : [
          { entityId: "ent-1", canonical: "范进", type: "PERSON", aliases: ["范进", "范老爷"], confidenceTier: "HIGH", activeChapters: [1], firstAppearanceChapter: 1, nameType: "NAMED" }
        ]
      });
      hoisted.callIdentityLlmMock.mockResolvedValue({
        data: {
          entities : [{ canonical: "范进", type: "PERSON", aliases: ["范进", "范老爷"] }],
          relations: [],
          bioFacts : []
        }
      });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: canonical 同名别名跳过，仅真实别名落库
      expect(mockPrisma.alias.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ entityId: "ent-1", alias: "范老爷" })
      }));
      expect(mockPrisma.alias.create).not.toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ alias: "范进" })
      }));
    });
  });

  describe("数据准备 buildBookSummary", () => {
    // 用例语义：书不存在时全书摘要返回空串，管线仍可继续执行。
    it("书不存在时全书摘要返回空串，管线继续执行", async () => {
      // Arrange
      mockPrisma.book.findUnique.mockResolvedValue(null);

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 提取 prompt 中全书摘要为空（真实 extractor 经 callIdentityLlm 收空摘要）
      const extractUser = hoisted.callIdentityLlmMock.mock.calls[0][0].user as string;
      const summary = extractUser.split("全书摘要：")[1].split("\n\n")[0];
      expect(summary).toBe("");
      expect(mockPrisma.analysisJob.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
      }));
    });

    // 用例语义：全书摘要超长时截断到 2000 字符（架构约定 1-2K）。
    it("全书摘要超长时截断到 2000 字符", async () => {
      // Arrange
      mockPrisma.book.findUnique.mockResolvedValue({ id: BOOK_ID, title: "儒林外史", description: "长".repeat(2500) });

      // Act
      await runner.runAnalysisJobById(JOB_ID);

      // Assert: 注入提取 prompt 的摘要长度 = 2000
      const extractUser = hoisted.callIdentityLlmMock.mock.calls[0][0].user as string;
      const summary = extractUser.split("全书摘要：")[1].split("\n\n")[0];
      expect(summary.length).toBe(BOOK_SUMMARY_MAX_CHARS);
    });
  });
});
