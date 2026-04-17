/**
 * Fixture 白名单校验 CLI（对齐契约 §0-1）。
 *
 * 用法：
 *   pnpm check:fixture-whitelist
 *
 * 背景：
 * - 三阶段架构要求回归 fixture 文本「只使用抽象占位名」（甲某/乙公/丁士/戊某…），
 *   不得混入真实古典小说中的具名实体，避免 fixture 泄漏进 baseline prompt 或训练语料。
 * - 本脚本遍历 `src/server/modules/analysis/pipelines/threestage/__fixtures__/` 下
 *   所有 `.txt`、`.md`、`.json`（text-like）文件，命中黑名单即退出码 ≠ 0。
 *
 * 与 `validate-prompt-whitelist.ts` 的区别：
 * - 本脚本只校验「fixture 章节文本 + 场景描述 + 期望 JSON 的 description 字段」；
 * - 不做 DIALOGUE 主语候选检测（fixture 允许任何 2-4 字抽象占位名在引入句）；
 * - 不做 BOOK_TITLE 检测（fixture 目前不出现书名号）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.resolve(
  here,
  "../src/server/modules/analysis/pipelines/threestage/__fixtures__"
);

/**
 * 具名实体黑名单。保持与 `src/lib/prompt-whitelist.ts` 的 NAMED_ENTITY_BLACKLIST
 * 实质等价；此处复制一份以避免 CLI 脚本耦合 `@/` 路径别名（ts-node 无 tsconfig-paths）。
 * 维护策略：两处同步更新；未来如需收敛，可在 src/lib 暴露纯 JSON 列表并 readFileSync。
 */
const NAMED_ENTITY_BLACKLIST: readonly string[] = [
  // 儒林外史
  "儒林外史", "范进", "胡屠户", "张乡绅", "周进", "严监生", "严贡生",
  "牛浦", "牛布衣", "牛浦郎", "娄三公子", "娄四公子", "张铁臂", "张俊民",
  "杜少卿", "匡超人", "马二先生", "王冕", "王冠", "沈琼枝",
  // 红楼梦
  "红楼梦", "石头记", "贾宝玉", "林黛玉", "薛宝钗", "王熙凤", "贾母", "贾政",
  "贾琏", "史湘云", "妙玉", "秦可卿", "袭人", "晴雯", "刘姥姥",
  // 水浒传
  "水浒传", "宋江", "武松", "林冲", "鲁智深", "李逵", "吴用", "晁盖",
  "潘金莲", "西门庆", "花荣", "史进",
  // 西游记
  "西游记", "孙悟空", "唐僧", "猪八戒", "沙僧", "玉皇大帝", "观音菩萨",
  "牛魔王", "铁扇公主", "如来佛祖", "菩提祖师",
  // 三国演义 / 历史演义
  "三国演义", "三国志", "诸葛亮", "刘备", "曹操", "孙权", "关羽", "张飞",
  "周瑜", "司马懿", "赵云", "吕布", "董卓",
  // 金瓶梅 / 明清其他
  "金瓶梅", "潘六儿", "李瓶儿", "庞春梅",
  // 神魔 / 封神
  "封神演义", "姜子牙", "哪吒", "纣王", "妲己",
  // 典型帝号
  "朱元璋", "太祖皇帝", "吴王", "崇祯", "康熙", "乾隆",
  // 典型地名
  "金陵", "汴梁", "长安", "洛阳"
];

/** 允许扫描的 fixture 文件后缀（其他如 .json 同时校验 description 文本字段）。 */
const SCANNABLE_EXTENSIONS = new Set([".txt", ".md", ".json"]);

interface FixtureViolation {
  file       : string;
  lineNo     : number;
  lineContent: string;
  match      : string;
}

function walkDir(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, out);
    } else if (entry.isFile() && SCANNABLE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
}

function scanFile(file: string): FixtureViolation[] {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");
  const violations: FixtureViolation[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const token of NAMED_ENTITY_BLACKLIST) {
      if (line.includes(token)) {
        violations.push({
          file       : path.relative(process.cwd(), file),
          lineNo     : i + 1,
          lineContent: line,
          match      : token
        });
      }
    }
  }
  return violations;
}

function main(): void {
  if (!fs.existsSync(FIXTURES_ROOT)) {
    console.error(`✖ fixtures 根目录不存在：${FIXTURES_ROOT}`);
    process.exit(1);
  }

  const files: string[] = [];
  walkDir(FIXTURES_ROOT, files);

  if (files.length === 0) {
    console.error(`✖ 未扫描到任何 fixture 文件：${FIXTURES_ROOT}`);
    process.exit(1);
  }

  const violations: FixtureViolation[] = [];
  for (const file of files) violations.push(...scanFile(file));

  if (violations.length === 0) {
    console.log(
      `✓ fixture 白名单校验通过：已扫描 ${files.length} 个文件（${FIXTURES_ROOT}）。`
    );
    return;
  }

  console.error(`✖ fixture 白名单命中 ${violations.length} 处违规：`);
  for (const v of violations) {
    console.error(
      `[${v.file}] line ${v.lineNo} match=${JSON.stringify(v.match)}\n    → ${v.lineContent.trim()}`
    );
  }
  process.exit(1);
}

main();
