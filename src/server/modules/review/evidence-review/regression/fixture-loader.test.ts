import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadReviewRegressionFixture,
  loadReviewRegressionFixtures
} from "./fixture-loader";

const FIXTURE_ROOT = path.resolve(process.cwd(), "tests/fixtures/review-regression");

function buildMinimalFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fixtureKey  : "temp-fixture",
    bookTitle   : "儒林外史",
    chapterRange: { startNo: 3, endNo: 3 },
    personas    : [{
      personaName     : "范进",
      aliases         : [],
      chapterNos      : [3],
      evidenceSnippets: ["范进进学回家"]
    }],
    chapterFacts: [{
      personaName     : "范进",
      chapterNo       : 3,
      factLabel       : "中举",
      evidenceSnippets: ["范进中举"]
    }],
    relations: [{
      sourcePersonaName    : "范进",
      targetPersonaName    : "胡屠户",
      relationTypeKey      : "father_in_law_of",
      relationLabel        : "岳父",
      direction            : "FORWARD",
      effectiveChapterStart: 3,
      effectiveChapterEnd  : 3,
      evidenceSnippets     : ["胡屠户训斥范进"]
    }],
    timeFacts: [{
      personaName      : "范进",
      normalizedLabel  : "范进中举后",
      timeSortKey      : 300,
      chapterRangeStart: 3,
      chapterRangeEnd  : 3,
      evidenceSnippets : ["中举之后"]
    }],
    reviewActions: [{
      scenarioKey: "accept-fact",
      action     : "ACCEPT_CLAIM",
      target     : {
        claimKind      : "EVENT",
        chapterNo      : 3,
        personaName    : "范进",
        evidenceSnippet: "范进中举"
      },
      expected: {
        auditAction       : "ACCEPT",
        projectionFamilies: ["persona_chapter_facts"]
      }
    }],
    rerunSamples: [],
    ...overrides
  };
}

async function withTempJsonFile(
  fileName: string,
  content: string,
  run: (filePath: string) => Promise<void>
): Promise<void> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "review-regression-"));
  try {
    const filePath = path.join(tempDir, fileName);
    await writeFile(filePath, content, "utf8");
    await run(filePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function withTempJsonFiles(
  files: ReadonlyArray<{ fileName: string; content: string }>,
  run: (filePaths: string[]) => Promise<void>
): Promise<void> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "review-regression-"));
  try {
    const filePaths: string[] = [];
    for (const file of files) {
      const filePath = path.join(tempDir, file.fileName);
      await writeFile(filePath, file.content, "utf8");
      filePaths.push(filePath);
    }

    await run(filePaths);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function findFixtureByKey(fixtures: Awaited<ReturnType<typeof loadReviewRegressionFixtures>>, fixtureKey: string) {
  return fixtures.find((fixture) => fixture.fixtureKey === fixtureKey);
}

describe("review regression fixture loader", () => {
  it("reads UTF-8 JSON fixtures and validates both Task 1 book baselines", async () => {
    const fixtures = await loadReviewRegressionFixtures([
      path.join(FIXTURE_ROOT, "rulin-waishi.fixture.json"),
      path.join(FIXTURE_ROOT, "sanguo-yanyi.fixture.json")
    ]);

    const rulin = findFixtureByKey(fixtures, "rulin-waishi-mvp");
    const sanguo = findFixtureByKey(fixtures, "sanguo-yanyi-standard");
    if (!rulin || !sanguo) {
      throw new Error("Expected both review regression fixtures");
    }

    expect(rulin.bookTitle).toBe("儒林外史");
    expect(rulin.personas.length).toBeGreaterThanOrEqual(1);
    expect(rulin.chapterFacts.length).toBeGreaterThanOrEqual(1);
    expect(rulin.personas.some((persona) => (
      persona.pressureCases.some((pressureCase) => (
        pressureCase.pressureType === "IDENTITY_CONFUSION"
        || pressureCase.pressureType === "MISIDENTIFICATION"
      ))
    ))).toBe(true);
    expect(rulin.reviewActions.length).toBeGreaterThanOrEqual(1);

    expect(sanguo.bookTitle).toBe("三国演义");
    expect(sanguo.timeFacts.some((timeFact) => timeFact.isImprecise)).toBe(true);
    expect(sanguo.relations.filter((relation) => (
      relation.sourcePersonaName === "刘备"
      && relation.targetPersonaName === "曹操"
    )).length).toBeGreaterThanOrEqual(2);
    expect(sanguo.rerunSamples.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps built-in gold fixtures aligned with seeded personas, facts, and legal review actions", async () => {
    const fixtures = await loadReviewRegressionFixtures([
      path.join(FIXTURE_ROOT, "rulin-waishi.fixture.json"),
      path.join(FIXTURE_ROOT, "sanguo-yanyi.fixture.json")
    ]);

    const rulin = findFixtureByKey(fixtures, "rulin-waishi-mvp");
    const sanguo = findFixtureByKey(fixtures, "sanguo-yanyi-standard");
    if (!rulin || !sanguo) {
      throw new Error("Expected both review regression fixtures");
    }

    expect(rulin.personas.some((persona) => persona.personaName === "张乡绅")).toBe(true);
    expect(rulin.reviewActions).toContainEqual(expect.objectContaining({
      scenarioKey: "defer-fan-jin-status-fact",
      action     : "DEFER_CLAIM",
      expected   : expect.objectContaining({
        auditAction       : "DEFER",
        projectionFamilies: ["persona_chapter_facts"]
      })
    }));

    expect(sanguo.chapterFacts).toContainEqual(expect.objectContaining({
      personaName     : "诸葛亮",
      chapterNo       : 37,
      factLabel       : "三顾茅庐后出山辅佐",
      evidenceSnippets: ["孔明出山辅佐刘备"]
    }));
  });

  it("normalizes whitespace in all evidence snippets while preserving Chinese UTF-8 text", async () => {
    const fixture = buildMinimalFixture({
      personas: [{
        personaName     : "范进",
        aliases         : [],
        chapterNos      : [3],
        evidenceSnippets: ["  范进\n\n中举\t后  "]
      }],
      reviewActions: [{
        scenarioKey: "accept-fact",
        action     : "ACCEPT_CLAIM",
        target     : {
          claimKind      : "EVENT",
          chapterNo      : 3,
          personaName    : "范进",
          evidenceSnippet: "  范进\n中举  "
        },
        expected: {
          auditAction       : "ACCEPT",
          projectionFamilies: ["persona_chapter_facts"]
        }
      }]
    });

    await withTempJsonFile("utf8.fixture.json", JSON.stringify(fixture), async (filePath) => {
      const loaded = await loadReviewRegressionFixture(filePath);

      expect(loaded.personas[0]?.evidenceSnippets).toEqual(["范进 中举 后"]);
      expect(loaded.reviewActions[0]?.target.evidenceSnippet).toBe("范进 中举");
    });
  });

  it("rejects invalid JSON with a file-scoped error", async () => {
    await withTempJsonFile("broken.fixture.json", "{", async (filePath) => {
      await expect(loadReviewRegressionFixture(filePath)).rejects.toThrow(
        `Invalid JSON in review regression fixture: ${filePath}`
      );
    });
  });

  it("rejects duplicate natural keys with collection, key, file, and index details", async () => {
    const duplicateCases = [
      {
        collection: "personas",
        naturalKey: "范进",
        fixture   : buildMinimalFixture({
          personas: [
            {
              personaName     : "范进",
              aliases         : [],
              chapterNos      : [3],
              evidenceSnippets: ["范进第一次出现"]
            },
            {
              personaName     : "范进",
              aliases         : ["范举人"],
              chapterNos      : [4],
              evidenceSnippets: ["范进第二次出现"]
            }
          ]
        })
      },
      {
        collection: "chapterFacts",
        naturalKey: "范进\u001f3\u001f中举",
        fixture   : buildMinimalFixture({
          chapterFacts: [
            {
              personaName     : "范进",
              chapterNo       : 3,
              factLabel       : "中举",
              evidenceSnippets: ["范进中举"]
            },
            {
              personaName     : "范进",
              chapterNo       : 3,
              factLabel       : "中举",
              evidenceSnippets: ["众人贺喜"]
            }
          ]
        })
      },
      {
        collection: "relations",
        naturalKey: "范进\u001f胡屠户\u001ffather_in_law_of\u001fFORWARD\u001f3\u001f3",
        fixture   : buildMinimalFixture({
          relations: [
            {
              sourcePersonaName    : "范进",
              targetPersonaName    : "胡屠户",
              relationTypeKey      : "father_in_law_of",
              relationLabel        : "岳父",
              direction            : "FORWARD",
              effectiveChapterStart: 3,
              effectiveChapterEnd  : 3,
              evidenceSnippets     : ["胡屠户训斥范进"]
            },
            {
              sourcePersonaName    : "范进",
              targetPersonaName    : "胡屠户",
              relationTypeKey      : "father_in_law_of",
              relationLabel        : "岳父",
              direction            : "FORWARD",
              effectiveChapterStart: 3,
              effectiveChapterEnd  : 3,
              evidenceSnippets     : ["胡屠户转而奉承范进"]
            }
          ]
        })
      },
      {
        collection: "timeFacts",
        naturalKey: "范进\u001f范进中举后\u001f3\u001f3",
        fixture   : buildMinimalFixture({
          timeFacts: [
            {
              personaName      : "范进",
              normalizedLabel  : "范进中举后",
              timeSortKey      : 300,
              chapterRangeStart: 3,
              chapterRangeEnd  : 3,
              evidenceSnippets : ["中举之后"]
            },
            {
              personaName      : "范进",
              normalizedLabel  : "范进中举后",
              timeSortKey      : 301,
              chapterRangeStart: 3,
              chapterRangeEnd  : 3,
              evidenceSnippets : ["中举后乡邻改口"]
            }
          ]
        })
      },
      {
        collection: "reviewActions",
        naturalKey: "accept-fact",
        fixture   : buildMinimalFixture({
          reviewActions: [
            {
              scenarioKey: "accept-fact",
              action     : "ACCEPT_CLAIM",
              target     : {
                claimKind      : "EVENT",
                chapterNo      : 3,
                personaName    : "范进",
                evidenceSnippet: "范进中举"
              },
              expected: {
                auditAction       : "ACCEPT",
                projectionFamilies: ["persona_chapter_facts"]
              }
            },
            {
              scenarioKey: "accept-fact",
              action     : "EDIT_CLAIM",
              target     : {
                claimKind      : "EVENT",
                chapterNo      : 3,
                personaName    : "范进",
                evidenceSnippet: "范进中举"
              },
              expected: {
                auditAction       : "EDIT",
                projectionFamilies: ["persona_chapter_facts"]
              }
            }
          ]
        })
      }
    ] as const;

    for (const duplicateCase of duplicateCases) {
      await withTempJsonFile(
        `${duplicateCase.collection}.fixture.json`,
        JSON.stringify(duplicateCase.fixture),
        async (filePath) => {
          await expect(loadReviewRegressionFixture(filePath)).rejects.toThrow(
            `Duplicate review regression natural key in ${filePath}: ${duplicateCase.collection} "${duplicateCase.naturalKey}" at indexes 0 and 1`
          );
        }
      );
    }
  });

  it("rejects duplicate fixture keys across different files", async () => {
    const fixture = buildMinimalFixture({ fixtureKey: "shared-fixture-key" });

    await withTempJsonFiles([
      {
        fileName: "first.fixture.json",
        content : JSON.stringify(fixture)
      },
      {
        fileName: "second.fixture.json",
        content : JSON.stringify({ ...fixture, bookTitle: "三国演义" })
      }
    ], async (filePaths) => {
      const [firstFilePath, secondFilePath] = filePaths;
      if (!firstFilePath || !secondFilePath) {
        throw new Error("Expected both temporary fixture paths");
      }

      await expect(loadReviewRegressionFixtures(filePaths)).rejects.toThrow(
        `Duplicate review regression fixtureKey "shared-fixture-key" in ${firstFilePath} and ${secondFilePath}`
      );
    });
  });
});
