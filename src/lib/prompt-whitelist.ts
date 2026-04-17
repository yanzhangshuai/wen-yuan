/**
 * Stage A/B/C Prompt 白名单校验（契约 §0-1）。
 *
 * 背景：三阶段架构要求 Prompt 正文「只可包含占位符、通用分类规则、enum 枚举值与
 * 结构化 schema 说明」，不得出现任何具名实体（人名、地名、书名、情节）。这避免
 * Prompt 把某一本书的语料偏见固化进全书通用基线。
 *
 * 规则只作用于 STAGE_A/B/C 三条 baseline；既有 twopass / sequential 基线仍保留
 * 历史人物示例（属于既有管线，参见 PRD §不做项），本白名单不覆盖它们。
 */

/** 禁词黑名单：常见古典小说主角 / 书名 / 典型具名实体。命中即违规。 */
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

/**
 * 允许出现在 Prompt 正文中的抽象占位名（虚构代号）。
 * 使用这些词描述示例，白名单校验将直接跳过。
 */
const ABSTRACT_PLACEHOLDER_TOKENS: readonly string[] = [
  // 二字代号
  "甲某", "乙公", "丁士", "乙丙", "某甲", "某乙", "某丙", "某丁", "某戊",
  "甲公", "丙公", "丁公", "戊公", "戊某", "乙某", "丙某", "丁某",
  // 三字代号
  "甲先生", "乙先生", "丙先生", "丁先生", "戊先生",
  "人物甲", "人物乙", "人物丙", "人物丁", "人物戊",
  "角色甲", "角色乙", "角色丙", "角色丁", "角色戊"
];

export interface PromptWhitelistViolation {
  slug       : string;
  rule       : "NAMED_ENTITY" | "BOOK_TITLE" | "DIALOGUE_SUBJECT";
  match      : string;
  lineNo     : number;
  lineContent: string;
}

export interface PromptWhitelistCandidate {
  slug        : string;
  systemPrompt: string;
  userPrompt  : string;
}

const BOOK_TITLE_REGEX = /《([^》]+)》/g;

/**
 * 检测引入句主语候选：连续 2-4 个汉字后紧跟「道/曰/说」。
 * 正面示例命中：「范进道」「宋江曰」。
 * 虚构占位名（甲某/乙公…）含在候选中，但会在 ABSTRACT_PLACEHOLDER_TOKENS 中放行。
 */
const DIALOGUE_SUBJECT_REGEX = /([\u4e00-\u9fff]{2,4})(?=[道曰说])/g;

function isAbstractPlaceholder(token: string): boolean {
  return ABSTRACT_PLACEHOLDER_TOKENS.includes(token);
}

export function validatePromptWhitelist(
  candidates: PromptWhitelistCandidate[]
): PromptWhitelistViolation[] {
  const violations: PromptWhitelistViolation[] = [];

  for (const candidate of candidates) {
    const combined = `${candidate.systemPrompt}\n${candidate.userPrompt}`;
    const lines = combined.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const token of NAMED_ENTITY_BLACKLIST) {
        if (line.includes(token)) {
          violations.push({
            slug       : candidate.slug,
            rule       : "NAMED_ENTITY",
            match      : token,
            lineNo     : i + 1,
            lineContent: line
          });
        }
      }

      // 书名号《…》只允许包占位（示例 schema 内的演示书名也禁），视为违规。
      BOOK_TITLE_REGEX.lastIndex = 0;
      let bookMatch: RegExpExecArray | null;
      while ((bookMatch = BOOK_TITLE_REGEX.exec(line)) !== null) {
        const title = bookMatch[1];
        violations.push({
          slug       : candidate.slug,
          rule       : "BOOK_TITLE",
          match      : `《${title}》`,
          lineNo     : i + 1,
          lineContent: line
        });
      }

      DIALOGUE_SUBJECT_REGEX.lastIndex = 0;
      let dialogMatch: RegExpExecArray | null;
      while ((dialogMatch = DIALOGUE_SUBJECT_REGEX.exec(line)) !== null) {
        const subject = dialogMatch[1];
        if (isAbstractPlaceholder(subject)) continue;
        // 已在 NAMED_ENTITY_BLACKLIST 命中的跳过，避免重复告警。
        if (NAMED_ENTITY_BLACKLIST.some((token) => token === subject || token.includes(subject))) {
          continue;
        }
        violations.push({
          slug       : candidate.slug,
          rule       : "DIALOGUE_SUBJECT",
          match      : subject,
          lineNo     : i + 1,
          lineContent: line
        });
      }
    }
  }

  return violations;
}

export function formatWhitelistViolations(violations: PromptWhitelistViolation[]): string {
  return violations
    .map(
      (v) =>
        `[${v.slug}] line ${v.lineNo} rule=${v.rule} match=${JSON.stringify(v.match)}\n    → ${v.lineContent.trim()}`
    )
    .join("\n");
}
