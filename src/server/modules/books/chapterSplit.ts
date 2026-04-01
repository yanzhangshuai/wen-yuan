import { ChapterType } from "@/generated/prisma/enums";

export interface ChapterSplitDraft {
  /** 章节序号（从 1 开始）。 */
  index      : number;
  /** 章节类型（PRELUDE/CHAPTER/POSTLUDE）。 */
  chapterType: ChapterType;
  /** 章节标题。 */
  title      : string;
  /** 章节正文字数（按非空白字符计数）。 */
  wordCount  : number;
  /** 章节正文内容。 */
  content    : string;
}

const PRELUDE_TITLE_REGEX = /^(楔子|序章?|序言|引子|前言|自序)(?:[\s\u3000]+.+)?$/;
const POSTLUDE_TITLE_REGEX = /^(后记|尾声|跋|附录|结语)(?:[\s\u3000]+.+)?$/;
const CHINESE_CHAPTER_TITLE_REGEX = /^(第[零〇一二三四五六七八九十百千万\d]+[回章节卷](?:[\s\u3000]+.+)?)$/;
const ENGLISH_CHAPTER_TITLE_REGEX = /^(chapter\s+\d+(?:\s*[:：.\-]\s*.+)?)$/i;

/**
 * 非正文标题黑名单——匹配到这些标题的段落不应被识别为正式章节，
 * 其内容会被合并到相邻正文章节中（若在最前面则丢弃）。
 *
 * 覆盖范围：前言/序言/绪论/引言/内容简介/作者简介/出版说明/编者按/编者的话/
 *          导读/再版说明/修订说明/译者序/译后记/凡例/自序/他序/
 *          后记/跋/附录说明/尾声/结语
 */
const NON_CONTENT_TITLE_REGEX = /^(前言|序言?|绪论|引言|内容简介|作者简介|出版说明|编者按|编者的话|导读|再版说明|修订说明|译者序|译后记|凡例|自序|他序|后记|跋|附录说明|序章)(?:[\s\u3000]+.+)?$/;

/**
 * 功能：判断标题是否属于非正文内容（前言/序言/后记等说明性段落）。
 * 输入：`title`（章节标题文本）。
 * 输出：布尔值。true 表示该标题为非正文，应从正式章节中排除。
 */
export function isNonContentTitle(title: string): boolean {
  return NON_CONTENT_TITLE_REGEX.test(title.trim());
}

/**
 * 功能：根据章节标题推断章节类型。
 * 输入：`title`（单行标题文本）。
 * 输出：`ChapterType`。
 * 异常：无。
 * 副作用：无。
 */
function detectChapterTypeByTitle(title: string): ChapterType {
  if (PRELUDE_TITLE_REGEX.test(title)) {
    return ChapterType.PRELUDE;
  }

  if (POSTLUDE_TITLE_REGEX.test(title)) {
    return ChapterType.POSTLUDE;
  }

  return ChapterType.CHAPTER;
}

/**
 * 功能：判断某一行是否可识别为章节标题。
 * 输入：`line`（已 trim 的文本行）。
 * 输出：布尔值。
 * 异常：无。
 * 副作用：无。
 */
function isChapterTitleLine(line: string): boolean {
  return CHINESE_CHAPTER_TITLE_REGEX.test(line)
    || ENGLISH_CHAPTER_TITLE_REGEX.test(line)
    || PRELUDE_TITLE_REGEX.test(line)
    || POSTLUDE_TITLE_REGEX.test(line)
    || NON_CONTENT_TITLE_REGEX.test(line);
}

/**
 * 功能：统计文本字数（忽略所有空白字符）。
 * 输入：`value` 文本。
 * 输出：字符数。
 * 异常：无。
 * 副作用：无。
 */
export function countWordLikeChars(value: string): number {
  return value.replace(/\s+/g, "").length;
}

/**
 * 功能：将原始全文按标题规则切分为章节草稿（含正文内容）。
 * 输入：`rawContent`（整本书原文）。
 * 输出：`ChapterSplitDraft[]`（章节标题、类型、字数、正文）。
 *       空章节（wordCount=0）自动过滤；index 从 1 连续重新编号。
 * 异常：无。
 * 副作用：无。
 */
/**
 * 功能：将非标准书源格式规范化为标准行格式，便于后续切分。
 * 处理规则：
 *   1. 剥离 UTF-8 BOM 头（部分 Windows 工具写出的带 BOM 文件）。
 *   2. 删除元数据行：`本章字数:xxxx`、连续三条以上短横线分隔线。
 *   3. 剥离章节标题行前的"正文 "前缀（书旗/掌阅等导出格式）。
 *   4. 去掉段落行开头的全角缩进空格（\u3000）。
 *   5. 清理每行行尾多余空白。
 * 输入：`raw`（原始书籍文本）。
 * 输出：规范化后的文本字符串。
 * 异常：无。
 * 副作用：无。
 */
export function normalizeBookText(raw: string): string {
  return raw
    // 1. 剥离 BOM
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      // 2. 删除元数据行（本章字数、分隔线）
      return !/^(本章字数[:：]\d+|-{3,})$/.test(t);
    })
    .map((line) => {
      // 3. 剥离章节标题前的"正文 "前缀
      const stripped = line.trim().replace(/^正文[\s\u3000]+/, "");
      // 4. 去掉段落行开头的全角缩进空格
      const normalized = line.match(/^\u3000/) ? stripped : line;
      // 5. 清理行尾空白
      return normalized.trimEnd();
    })
    .join("\n");
}

export function splitRawContentToChapterDrafts(rawContent: string): ChapterSplitDraft[] {
  const normalized = normalizeBookText(rawContent);
  const lines = normalized.split(/\r?\n/);
  const titleLines: Array<{ lineIndex: number; title: string }> = [];

  lines.forEach((line, lineIndex) => {
    const normalizedLine = line.trim();
    if (!normalizedLine) {
      return;
    }

    if (isChapterTitleLine(normalizedLine)) {
      titleLines.push({
        lineIndex,
        title: normalizedLine
      });
    }
  });

  if (titleLines.length === 0) {
    return [
      {
        index      : 1,
        chapterType: ChapterType.CHAPTER,
        title      : "正文",
        wordCount  : countWordLikeChars(rawContent),
        content    : rawContent
      }
    ];
  }

  const drafts = titleLines.map((item, index) => {
    const nextItem = titleLines[index + 1];
    const contentStart = item.lineIndex + 1;
    const contentEnd = nextItem ? nextItem.lineIndex : lines.length;
    const content = lines.slice(contentStart, contentEnd).join("\n");

    return {
      index      : index + 1,
      chapterType: detectChapterTypeByTitle(item.title),
      title      : item.title,
      wordCount  : countWordLikeChars(content),
      content
    };
  });

  // 过滤非正文章节（前言/序言/后记/跋等），同时过滤字数为 0 的空章节。
  const filtered = drafts.filter((item) => item.wordCount > 0 && !isNonContentTitle(item.title));
  if (filtered.length === 0) {
    // 全部过滤（极端情况），回退为整文一章。
    return [
      {
        index      : 1,
        chapterType: ChapterType.CHAPTER,
        title      : "正文",
        wordCount  : countWordLikeChars(rawContent),
        content    : rawContent
      }
    ];
  }

  // 楔子保留（它是正文叙事开端，不属于"说明性前言"），从 index 0 开始编号；
  // 正文章节（CHAPTER/POSTLUDE）从 1 开始，使楔子不占用正文序号。
  const firstIsPrelude = filtered[0]?.chapterType === ChapterType.PRELUDE;
  const startIndex = firstIsPrelude ? 0 : 1;
  return filtered.map((item, index) => ({ ...item, index: index + startIndex }));
}
