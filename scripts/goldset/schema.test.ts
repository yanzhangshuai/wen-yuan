import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateGoldset, validateGoldsetFile } from "./schema";

/** 收集 scripts/goldset/<book>/ 下所有标注 JSON 文件（排除 raw/ 片源）。 */
async function listGoldsetFiles(): Promise<string[]> {
  const books = await readdir(new URL(".", import.meta.url), { withFileTypes: true });
  const files: string[] = [];
  for (const book of books) {
    if (!book.isDirectory() || book.name === "raw") continue;
    const dir = fileURLToPath(new URL(`./${book.name}/`, import.meta.url));
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".json")) files.push(fileURLToPath(new URL(`./${book.name}/${e.name}`, import.meta.url)));
    }
  }
  return files.sort();
}

const validChapter = {
  book: "儒林外史",
  chapterNo: 1,
  entities: [
    {
      canonical: "王冕",
      type: "PERSON",
      nameType: "NAMED",
      aliases: ["王相公", "王大叔"],
      firstAppearancePara: 1,
      activeChapters: [1],
    },
    { canonical: "王冕母", type: "PERSON", nameType: "TITLE_ONLY", aliases: ["母亲"], firstAppearancePara: 1 },
  ],
  relations: [
    { typeCode: "母子", sourceCanonical: "王冕母", targetCanonical: "王冕", evidence: "母亲同他到隔壁秦老家", chapterNo: 1 },
  ],
  bioFacts: [
    { category: "TRAVEL", subjectCanonical: "王冕", summary: "离家赴济南", evidence: "一迳来到山东济南府", chapterNo: 1 },
  ],
};

describe("goldset schema", () => {
  it("合法数据通过校验", () => {
    const res = validateGoldset(validChapter);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.entities).toHaveLength(2);
      // nameType 默认值生效
      expect(res.data.entities[1].nameType).toBe("TITLE_ONLY");
    }
  });

  it("非法枚举类型被拒绝", () => {
    const bad = structuredClone(validChapter);
    bad.entities[0].type = "MONSTER";
    const res = validateGoldset(bad);
    expect(res.ok).toBe(false);
  });

  it("悬空 canonical 引用被拒绝", () => {
    const bad = structuredClone(validChapter);
    bad.relations[0].targetCanonical = "不存在的实体";
    const res = validateGoldset(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(JSON.stringify(res.errors)).toContain("悬空 canonical");
    }
  });

  it("缺失 entities 数组被拒绝", () => {
    const bad = { book: "儒林外史", chapterNo: 1 };
    expect(validateGoldset(bad).ok).toBe(false);
  });
});

describe("goldset 标注文件（集成）", () => {
  it("所有已标注章节 JSON 通过校验", async () => {
    const files = await listGoldsetFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const res = await validateGoldsetFile(f);
      expect(res.ok, `${f}: ${JSON.stringify(res.ok ? "" : res.errors)}`).toBe(true);
    }
  });
});
