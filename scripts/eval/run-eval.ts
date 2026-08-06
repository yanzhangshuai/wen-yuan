/**
 * eval-gate CLI：goldset vs 提取结果 的 F1 门禁。
 *
 * 用法：
 *   node scripts/eval/run-eval.ts                 # 全量（scripts/eval/results 下找提取结果）
 *   node scripts/eval/run-eval.ts --book 儒林外史  # 只跑某书
 *   node scripts/eval/run-eval.ts --results <dir>  # 指定提取结果目录
 *
 * 门禁（D15）：entityF1≥0.74 / relationF1≥0.68（跨章微平均）。
 * 无提取结果 → 退出码 1（提示先跑管线，不能空手claim质量）。
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateGoldsetFile } from "../goldset/schema.ts";
import type { ExtractionChapter } from "./types.ts";
import { evaluateAll } from "./evaluate.ts";

const ENTITY_F1_GATE = 0.74;
const RELATION_F1_GATE = 0.68;
const GOLDSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "goldset");
const DEFAULT_RESULTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "results");

interface Args {
  book?: string;
  resultsDir: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { resultsDir: DEFAULT_RESULTS_DIR };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--book") a.book = argv[++i];
    else if (argv[i] === "--results") a.resultsDir = argv[++i];
  }
  return a;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

interface GoldsetEntry {
  book: string;
  chapterNo: number;
  file: string; // 与提取结果同名对齐：ch01.json
  goldset: Awaited<ReturnType<typeof validateGoldsetFile>> & { ok: true };
}

async function loadGoldsetChapters(bookFilter?: string): Promise<GoldsetEntry[]> {
  const books = await readdir(GOLDSET_DIR, { withFileTypes: true });
  const chapters: GoldsetEntry[] = [];
  for (const b of books) {
    if (!b.isDirectory() || b.name === "raw") continue;
    if (bookFilter && b.name !== bookFilter) continue;
    const dir = path.join(GOLDSET_DIR, b.name);
    for (const f of await readdir(dir)) {
      if (!f.endsWith(".json")) continue;
      const res = await validateGoldsetFile(path.join(dir, f));
      if (!res.ok) throw new Error(`goldset 文件非法: ${b.name}/${f} — ${JSON.stringify(res.errors).slice(0, 200)}`);
      chapters.push({ book: b.name, chapterNo: res.data.chapterNo, file: f, goldset: res });
    }
  }
  return chapters.sort((x, y) => x.book.localeCompare(y.book) || x.chapterNo - y.chapterNo);
}

async function loadExtraction(resultsDir: string, book: string, file: string): Promise<ExtractionChapter | null> {
  const p = path.join(resultsDir, book, file);
  try {
    const raw = await readFile(p, "utf-8");
    return JSON.parse(raw) as ExtractionChapter;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chapters = await loadGoldsetChapters(args.book);

  if (chapters.length === 0) {
    console.error("❌ 未找到 goldset 章节（scripts/goldset/<书>/*.json）。先标注再跑 eval。");
    process.exit(1);
  }

  console.log(`📚 goldset: ${chapters.length} 章（${new Set(chapters.map((c) => c.book)).size} 本书）`);
  console.log(`📁 提取结果目录: ${args.resultsDir}`);
  console.log("");

  const pairs: { goldset: (typeof chapters)[number]["goldset"]["data"]; ext: ExtractionChapter }[] = [];
  let missing = 0;
  for (const c of chapters) {
    const ext = await loadExtraction(args.resultsDir, c.book, c.file);
    if (!ext) {
      missing++;
      // 无提取结果 → 按"全漏"计（goldset 全部未命中），recall 记 0，并告警
      pairs.push({ goldset: c.goldset.data, ext: { book: c.book, chapterNo: c.chapterNo, entities: [], relations: [], bioFacts: [] } });
      console.warn(`  ⚠️ 缺提取结果: ${c.book}/${c.file}（按全漏计入）`);
    } else {
      pairs.push({ goldset: c.goldset.data, ext });
    }
  }
  if (missing > 0) console.log("");

  const agg = evaluateAll(pairs);

  const line = `  entityF1: ${pct(agg.entity.f1)}  relationF1: ${pct(agg.relation.f1)}  bioFactF1: ${pct(agg.bioFact.f1)}`;
  console.log("── 聚合（跨章微平均）──────────────────────────────");
  console.log(line);
  console.log(`  实体 TP=${agg.entity.matched} / gold ${agg.entity.goldTotal} / ext ${agg.entity.extTotal}`);
  console.log(`  关系 TP=${agg.relation.matched} / gold ${agg.relation.goldTotal} / ext ${agg.relation.extTotal}`);
  console.log("");

  for (const [book, b] of agg.byBook) {
    console.log(`  【${book}】 entityF1 ${pct(b.entity.f1)}（P ${pct(b.entity.precision)} / R ${pct(b.entity.recall)}） · relationF1 ${pct(b.relation.f1)}（P ${pct(b.relation.precision)} / R ${pct(b.relation.recall)}）`);
  }
  console.log("");

  // 明细（每章一行）
  for (const c of agg.chapters) {
    if (c.entity.goldTotal + c.relation.goldTotal === 0) continue;
    console.log(`  ch${String(c.chapterNo).padStart(2, "0")}: entityF1 ${pct(c.entity.f1)}（${c.entity.matched}/${c.entity.goldTotal}） relationF1 ${pct(c.relation.f1)}（${c.relation.matched}/${c.relation.goldTotal}）`);
    if (c.goldMissingEntities.length || c.extExtraEntities.length || c.goldMissingRelations.length || c.extExtraRelations.length || c.typeMismatchEntities.length) {
      console.log(`     漏实体: ${c.goldMissingEntities.join("、") || "-"}`);
      console.log(`     多实体: ${c.extExtraEntities.join("、") || "-"}`);
      if (c.typeMismatchEntities.length) console.log(`     类型错: ${c.typeMismatchEntities.map((t) => `${t.name}(${t.goldType}→${t.extType})`).join("、")}`);
      if (c.goldMissingRelations.length) console.log(`     漏关系: ${c.goldMissingRelations.join("、")}`);
      if (c.extExtraRelations.length) console.log(`     多关系: ${c.extExtraRelations.join("、")}`);
    }
  }

  const pass = agg.entity.f1 >= ENTITY_F1_GATE && agg.relation.f1 >= RELATION_F1_GATE;
  console.log("");
  if (pass) {
    console.log(`✅ eval:gate 通过（entityF1≥${ENTITY_F1_GATE} / relationF1≥${RELATION_F1_GATE}）`);
    process.exit(0);
  } else {
    console.log(`❌ eval:gate 未达标（要求 entityF1≥${ENTITY_F1_GATE} / relationF1≥${RELATION_F1_GATE}）`);
    if (missing > 0) console.log(`   注：${missing} 章缺提取结果，按全漏计入——先跑管线产出结果再评价。`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("eval-gate 运行失败:", e);
  process.exit(1);
});
