import { beforeEach, describe, expect, it, vi } from "vitest";
import { callIdentityLlm } from "./llm.ts";
import { buildIdentityUserPrompt, runIdentityPass } from "./identityPass.ts";

// mock prisma 单例：本地 vi.fn() 对象（类型独立于 PrismaClient，规避 unbound-method）
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = { entity: { findMany: vi.fn() } };
  return { mockPrisma };
});

vi.mock("@/server/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("./llm.ts", () => ({ callIdentityLlm: vi.fn() }));

const mockCall = vi.mocked(callIdentityLlm);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildIdentityUserPrompt", () => {
  it("包含表面形式名单（带提及频次）与类型", () => {
    const prompt = buildIdentityUserPrompt("PERSON", [
      { name: "范进", count: 12 },
      { name: "范老爷", count: 9 }
    ]);
    expect(prompt).toContain("范进(12次)");
    expect(prompt).toContain("范老爷(9次)");
    expect(prompt).toContain("PERSON");
  });
});

describe("runIdentityPass", () => {
  it("按类型折叠表面形式 → 返回 canonical 组（含跨变体合并）", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([
      { name: "范进", entityType: "PERSON", _count: { mentions: 12 } },
      { name: "范老爷", entityType: "PERSON", _count: { mentions: 9 } },
      { name: "范学道", entityType: "PERSON", _count: { mentions: 2 } },
      { name: "严贡生", entityType: "PERSON", _count: { mentions: 5 } },
      { name: "南京", entityType: "LOCATION", _count: { mentions: 8 } }
    ]);
    mockCall.mockResolvedValueOnce({
      data: {
        entities: [
          { canonical: "范进", aliases: ["范老爷", "范学道"] },
          { canonical: "严贡生", aliases: [] }
        ],
        dropped: ["轿夫"]
      }
    });
    mockCall.mockResolvedValueOnce({
      data: {
        entities: [{ canonical: "南京", aliases: [] }],
        dropped : []
      }
    });

    const result = await runIdentityPass({ bookId: "book-1", jobId: "job-1", agentRunId: "run-1" });

    expect(result.surfaceForms).toEqual(expect.arrayContaining(["范进", "南京"]));
    expect(result.groups).toContainEqual({ canonical: "范进", aliases: ["范老爷", "范学道"], type: "PERSON" });
    expect(result.groups).toContainEqual({ canonical: "南京", aliases: [], type: "LOCATION" });
    // 身份调用按类型一次（PERSON 一次 + LOCATION 一次）
    expect(mockCall).toHaveBeenCalledTimes(2);
  });

  it("输出中的名单外名字被丢弃（不引入臆造 canonical/alias）", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([
      { name: "范进", entityType: "PERSON", _count: { mentions: 12 } }
    ]);
    mockCall.mockResolvedValueOnce({
      data: {
        entities: [
          { canonical: "范进", aliases: ["范老爷", "范进中举"] } // 范进中举 不在名单
        ],
        dropped: []
      }
    });

    const result = await runIdentityPass({ bookId: "book-1", jobId: "job-1", agentRunId: "run-1" });

    // 名单外 alias 被剔除（范老爷/范进中举 均不在名单）；canonical 在名单 → 正常归属
    expect(result.groups).toContainEqual({ canonical: "范进", aliases: [], type: "PERSON" });
    expect(result.dropped).toEqual([]);
  });

  it("无实体类型不调用身份 LLM", async () => {
    mockPrisma.entity.findMany.mockResolvedValue([]);

    const result = await runIdentityPass({ bookId: "book-1", jobId: "job-1", agentRunId: "run-1" });

    expect(mockCall).not.toHaveBeenCalled();
    expect(result.groups).toEqual([]);
  });
});
