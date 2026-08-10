/**
 * 分片策略（slices.ts）
 *
 * - 每片 1 章（v7 逐章提取：章节归属天然正确，无需 chapterNo 定位）
 * - 超长单章（>maxChapterChars）拆段，段输出合并
 * - 片边界取章节边界
 */
export interface ChapterRef {
  id     : string;
  no     : number;
  title  : string;
  content: string;
}

export interface Slice {
  bookId    : string;
  chapters  : ChapterRef[];
  /** 本片章号（v7 逐章后为单章） */
  chapterNos: number[];
}

export const DEFAULT_SLICE_SIZE = 1; // 每片章数（v7：逐章提取）
export const DEFAULT_MAX_CHAPTER_CHARS = 12_000; // 超长章阈值

/**
 * 将章节列表切成单章片（v7 逐章提取）。
 * @param chapters 已按 no 排序的章节
 * @param bookId 所属书籍 ID
 * @param sliceSize 每片章数（默认 1）
 */
export function buildSlices(chapters: ChapterRef[], bookId: string, sliceSize = DEFAULT_SLICE_SIZE): Slice[] {
  if (chapters.length === 0) return [];

  const slices: Slice[] = [];
  for (let i = 0; i < chapters.length; i += sliceSize) {
    const group = chapters.slice(i, i + sliceSize);
    slices.push({
      bookId,
      chapters  : group,
      chapterNos: group.map((c) => c.no)
    });
  }
  return slices;
}

/** 判断单章是否超长（需分段处理）。 */
export function isOversizedChapter(chapter: ChapterRef, maxChars = DEFAULT_MAX_CHAPTER_CHARS): boolean {
  return chapter.content.length > maxChars;
}

/**
 * 超长章拆段（按段落边界，每段 ≤ maxChars）。
 * 段数 ≤3；段间按段落断点切。
 */
export function splitOversizedChapter(chapter: ChapterRef, maxChars = DEFAULT_MAX_CHAPTER_CHARS): string[] {
  if (!isOversizedChapter(chapter, maxChars)) return [chapter.content];

  const paragraphs = chapter.content.split(/\n+/);
  const segments: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 1 > maxChars && current.length > 0) {
      segments.push(current);
      current = para;
    } else {
      current = current ? `${current}\n${para}` : para;
    }
  }
  if (current) segments.push(current);

  // 兜底：极端情况（单段超长）直接截断
  return segments.map((s) => (s.length > maxChars ? s.slice(0, maxChars) : s));
}
