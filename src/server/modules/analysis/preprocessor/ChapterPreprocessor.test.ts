/**
 * 被测对象：Stage 0 章节预处理器（preprocessor/*）。
 * 测试目标：四区段切分、覆盖率自白、LOW/HIGH 信心判定、死亡标记候选抽取。
 * 覆盖范围：success / failure / boundary（空串、无触发词、混乱拼接、儒林外史样例）。
 */

import { describe, expect, it } from "vitest";

import { preprocessChapter } from "@/server/modules/analysis/preprocessor/ChapterPreprocessor";
import { DEATH_MARKERS, extractSubjectCandidate, scanDeathMarkers } from "@/server/modules/analysis/preprocessor/deathMarkers";

// ── 小工具 ──────────────────────────────────────────────────────────────

/** 重复一段文字 n 次，方便构造"纯正叙" fixture。 */
function repeat(str: string, n: number): string {
  return Array.from({ length: n }, () => str).join("");
}

/** 将若干段落用单换行拼成一章（儒林外史原文即此排布）。 */
function joinParagraphs(...paragraphs: string[]): string {
  return paragraphs.join("\n");
}

// ── preprocessChapter：覆盖率与信心 ─────────────────────────────────────

describe("preprocessChapter - 四区段切分与覆盖率自白", () => {
  it("纯正叙章节 → unclassified < 10% AND HIGH", () => {
    // Arrange：构造 3 个自然段的长叙事文，无诗无对白无议论起首
    const chapter = joinParagraphs(
      repeat("此时春光明媚，王冕独自一人在湖边放牛，心中想着读书的事情。", 8),
      repeat("日头渐高，湖面波光粼粼，远处的山峦如眉黛一般，衬得景色格外宜人。", 8),
      repeat("他在柳荫下坐了许久，才慢慢起身赶着牛回家去了。", 8)
    );

    // Act
    const result = preprocessChapter(chapter, 1);

    // Assert：HIGH 信心、NARRATIVE 占主导、其他段为 0
    expect(result.confidence).toBe("HIGH");
    expect(result.coverage.unclassified).toBeLessThan(0.10);
    expect(result.coverage.narrative).toBeGreaterThan(0.9);
    expect(result.coverage.poem).toBe(0);
    expect(result.coverage.dialogue).toBe(0);
    expect(result.coverage.commentary).toBe(0);
    expect(result.regions.every(r => r.type === "NARRATIVE")).toBe(true);
  });

  it("含 3 首诗词 → POEM 占比正确，不被 NARRATIVE 吞", () => {
    // Arrange：3 个"有诗为证" 触发段，每段夹在叙事中间
    const poem1 = "有诗为证：春风桃李花开日，秋雨梧桐叶落时。此诗道尽世态炎凉。";
    const poem2 = "词曰：青山依旧在，几度夕阳红。此词说的便是古今多少事。";
    const poem3 = "诗曰：一朝春尽红颜老，花落人亡两不知。此诗言外之意深远。";
    const chapter = joinParagraphs(
      "且说王冕每日读书，甚是用心，邻里乡亲无不称赞他勤勉好学。",
      poem1,
      "王冕看罢，心中感叹不已，遂又翻开另一本古籍细细品读起来。",
      poem2,
      "如此读了半日，忽听得门外有人敲门，却是同窗好友来访。",
      poem3,
      "两人坐下品茗论文，谈兴甚浓，一直到日落西山才作别。"
    );

    // Act
    const result = preprocessChapter(chapter, 2);

    // Assert：POEM 区段恰好 3 条，且覆盖率 > 0
    const poemRegions = result.regions.filter(r => r.type === "POEM");
    expect(poemRegions).toHaveLength(3);
    expect(result.coverage.poem).toBeGreaterThan(0);
    // POEM 区段字符总和必须等于实际 POEM 字数（不被 NARRATIVE 吞）
    const poemChars = poemRegions.reduce((acc, r) => acc + (r.end - r.start), 0);
    expect(poemChars).toBe(poem1.length + poem2.length + poem3.length);
    expect(result.confidence).toBe("HIGH");
  });

  it("`却说` / `话说` 起首 → COMMENTARY 段落被识别", () => {
    // Arrange：典型议论起首 + 中段普通叙事
    const chapter = joinParagraphs(
      "却说这几位乡绅，平日里好做一些面子上的功夫，暗地里却各怀心思，多有龃龉。",
      "王冕听得，只是微微一笑，并不插言，心中自有一番计较。",
      "看官听说，这便是当日士林风气，看似礼让实则攀援，真令有识之士痛心疾首。"
    );

    // Act
    const result = preprocessChapter(chapter, 3);

    // Assert：两个 COMMENTARY 段（却说 + 看官听说）+ 中间 NARRATIVE
    const commentary = result.regions.filter(r => r.type === "COMMENTARY");
    const narrative = result.regions.filter(r => r.type === "NARRATIVE");
    expect(commentary).toHaveLength(2);
    expect(narrative).toHaveLength(1);
    expect(commentary[0].text.startsWith("却说")).toBe(true);
    expect(commentary[1].text.startsWith("看官听说")).toBe(true);
    expect(result.confidence).toBe("HIGH");
  });

  it("`王冕道：\"……\"` → DIALOGUE 区段 + 说话人抽取", () => {
    // Arrange
    const chapter = joinParagraphs(
      "此时夜已深，王冕还在灯下读书，忽见门外一人走了进来，原来是邻人秦老。",
      "王冕道：\u201c秦老深夜来此，必有要事相商，请速讲。\u201d",
      "秦老笑道：\u201c确有一事，须得你帮忙思量。\u201d",
      "两人于是坐下细谈，直到三更天才各自歇下。"
    );

    // Act
    const result = preprocessChapter(chapter, 4);

    // Assert
    const dialogues = result.regions.filter(r => r.type === "DIALOGUE");
    expect(dialogues).toHaveLength(2);
    expect(dialogues[0].speaker).toBe("王冕");
    expect(dialogues[1].speaker).toBe("秦老");
    // 引入句"王冕道："被包含在 DIALOGUE 区段中
    expect(dialogues[0].text.startsWith("王冕道")).toBe(true);
    expect(dialogues[1].text.startsWith("秦老笑道")).toBe(true);
    // 新增（T03）：引入句主语 span 精确回填
    expect(dialogues[0].speakerStart).toBe(dialogues[0].start);
    expect(dialogues[0].speakerEnd).toBe(dialogues[0].start + 2);
    expect(chapter.slice(dialogues[0].speakerStart, dialogues[0].speakerEnd)).toBe("王冕");
    expect(chapter.slice(dialogues[1].speakerStart, dialogues[1].speakerEnd)).toBe("秦老");
  });

  it("LOW confidence：混乱拼接文本正确打标", () => {
    // Arrange：大量短碎片/ASCII 噪声/只有标点的行，CJK 密度不足
    const chapter = joinParagraphs(
      "!!! ### @@@",
      "abc 123 xyz",
      "??? --- ~~~",
      "a1",
      "b2",
      "c3",
      "x y z",
      "$ % ^",
      "( ) { }",
      "< > ="
    );

    // Act
    const result = preprocessChapter(chapter, 99);

    // Assert：unclassified 占比极高 → LOW
    expect(result.confidence).toBe("LOW");
    expect(result.coverage.unclassified).toBeGreaterThan(0.10);
  });

  it("空串 → 默认 HIGH、coverage 全 0、空数组", () => {
    const result = preprocessChapter("", 0);
    expect(result.confidence).toBe("HIGH");
    expect(result.coverage).toEqual({
      narrative   : 0,
      poem        : 0,
      dialogue    : 0,
      commentary  : 0,
      unclassified: 0
    });
    expect(result.regions).toEqual([]);
    expect(result.regionMap).toEqual([]);
    expect(result.deathMarkerHits).toEqual([]);
  });

  it("regionMap 与 regions 一一对应（精简字段）", () => {
    const chapter = "王冕道：\u201c你来。\u201d后来他又独自读书了很久很久，一直到深夜方才歇下。";
    const result = preprocessChapter(chapter, 5);
    expect(result.regionMap).toHaveLength(result.regions.length);
    for (let i = 0; i < result.regions.length; i += 1) {
      expect(result.regionMap[i]).toEqual({
        start: result.regions[i].start,
        end  : result.regions[i].end,
        type : result.regions[i].type
      });
    }
  });

  it("DIALOGUE 夹在叙事中间 → 行被正确切成 NARRATIVE / DIALOGUE / NARRATIVE", () => {
    // Arrange：单行内先叙事、再引号对白、再叙事，考察 subtractClaimed 中段缝隙分支
    const line = "此时天色已晚，王冕道：\u201c明日再谈。\u201d然后便回家读书去了，整夜不曾歇息一刻。";
    const result = preprocessChapter(line, 10);

    // Assert：行前缀 NARRATIVE + DIALOGUE + 行后缀 NARRATIVE
    const types = result.regions.map(r => r.type);
    expect(types).toEqual(["NARRATIVE", "DIALOGUE", "NARRATIVE"]);
    const dialogue = result.regions.find(r => r.type === "DIALOGUE")!;
    expect(dialogue.speaker).toBe("王冕");
  });

  it("POEM 内含引号 → DIALOGUE 不抢占 POEM 区间（POEM 优先）", () => {
    // Arrange：POEM 触发段内部带全角引号，验证 rangeOverlaps 生效
    const chapter = "有诗为证：古人云\u201c天行健\u201d君子以自强不息。此诗劝人奋进也。\n"
      + "王冕读罢掩卷长思，觉得诗中道理深远可鉴。";
    const result = preprocessChapter(chapter, 11);

    // Assert：没有任何 DIALOGUE 区段（引号被 POEM 吞下）
    expect(result.regions.some(r => r.type === "DIALOGUE")).toBe(false);
    expect(result.regions.some(r => r.type === "POEM")).toBe(true);
  });

  it("POEM 收束紧接 DIALOGUE → 引入句不回扫入 POEM 区间", () => {
    // Arrange：`此诗` 紧接 `王冕道：\u201c……\u201d`，引入句回扫 20 字会落入 POEM 末尾
    const chapter = "诗曰：天行健此诗甚妙。王冕道：\u201c妙哉。\u201d";
    const result = preprocessChapter(chapter, 12);

    // Assert：DIALOGUE 区段存在且 speaker 被识别；POEM 与 DIALOGUE 不重叠
    const dialogue = result.regions.find(r => r.type === "DIALOGUE");
    const poem = result.regions.find(r => r.type === "POEM");
    expect(dialogue).toBeDefined();
    expect(poem).toBeDefined();
    expect(dialogue!.speaker).toBe("王冕");
    expect(dialogue!.start).toBeGreaterThanOrEqual(poem!.end);
  });

  it("POEM 结尾兜底：`此诗` 后无句号/换行 → 区段至收束词末尾", () => {
    // Arrange：POEM 收束词位于章尾，无 `。` 亦无 `\n`，触发 sentenceEnd === -1 分支
    const chapter = "诗曰：春江花月此诗";
    const result = preprocessChapter(chapter, 13);
    const poem = result.regions.find(r => r.type === "POEM");
    expect(poem).toBeDefined();
    expect(poem!.end).toBe(chapter.length);
  });

  it("POEM 后紧跟空行 → blankLine 参与结束位置判定", () => {
    // Arrange：POEM 中部无 `此诗` 收束，靠空行终止区段
    const chapter = "诗曰：天行健君子以自强不息日出东方\n\n王冕每日读书甚是用心邻里乡亲无不称赞。";
    const result = preprocessChapter(chapter, 14);
    const poem = result.regions.find(r => r.type === "POEM");
    expect(poem).toBeDefined();
    // POEM 不应越过空行进入下一段
    expect(chapter.slice(poem!.start, poem!.end)).not.toContain("王冕");
  });

  it("DIALOGUE 贴章尾结束 → subtractClaimed break 分支触发", () => {
    // Arrange：整章就是一个引号对白，claim 一直延伸到 line.end
    const chapter = "王冕道：\u201c明日再谈。\u201d";
    const result = preprocessChapter(chapter, 15);
    // Assert：只有 DIALOGUE，无任何 NARRATIVE 尾巴
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].type).toBe("DIALOGUE");
  });

  it("低 CJK 密度行（CJK ≥ 5 但密度 < 40%） → 归入 unclassified", () => {
    // Arrange：一行中 CJK >= 5 但大量 ASCII 占位符，密度 < 40%
    const chapter = "aaaaaaaaaaaaaaaaaaaaaaaa 王冕今日读书";
    const result = preprocessChapter(chapter, 16);
    expect(result.regions).toHaveLength(0);
    expect(result.coverage.unclassified).toBe(1);
    expect(result.confidence).toBe("LOW");
  });

  it("章内含纯空行 → 空行字符自然归入 unclassified", () => {
    // Arrange：正文 + 空白行 + 正文（空白行只有空格）
    const chapter = "王冕在村中读书，日日如是。\n   \n王冕学问渐长，远近闻名。";
    const result = preprocessChapter(chapter, 17);
    // Assert：两段 NARRATIVE 区段 + 少量 unclassified（空白行）
    const narrativeRegions = result.regions.filter(r => r.type === "NARRATIVE");
    expect(narrativeRegions).toHaveLength(2);
    expect(result.coverage.unclassified).toBeGreaterThan(0);
  });
});

// ── 死亡标记扫描 ─────────────────────────────────────────────────────────

describe("scanDeathMarkers - 死亡标记词 + 主语抽取", () => {
  it("11+ 死亡标记词全部命中 + 主语抽取率 ≥ 90%", () => {
    // Arrange：每句一个不同标记词，前置 2~4 字中文人名或人物称谓
    const fixtures: Array<{ sentence: string; marker: string; expectedSubject: string }> = [
      { sentence: "去年冬月，牛布衣病逝于庵中。",   marker: "病逝",     expectedSubject: "牛布衣" },
      { sentence: "不多时，王员外病故家中。",       marker: "病故",     expectedSubject: "王员外" },
      { sentence: "未及半月，严监生故去。",         marker: "故去",     expectedSubject: "严监生" },
      { sentence: "旋即，周老太太归天。",           marker: "归天",     expectedSubject: "周老太太" },
      { sentence: "战场上的那贼兵一命呜呼。",       marker: "一命呜呼", expectedSubject: "那贼兵" },
      { sentence: "老父殒命于道路之上。",           marker: "殒命",     expectedSubject: "老父" },
      { sentence: "老僧圆寂于禅房。",               marker: "圆寂",     expectedSubject: "老僧" },
      { sentence: "道士羽化登仙。",                 marker: "羽化",     expectedSubject: "道士" },
      { sentence: "那孩童夭亡。",                   marker: "夭亡",     expectedSubject: "那孩童" },
      { sentence: "书生死于非命。",                 marker: "死于",     expectedSubject: "书生" },
      { sentence: "李将军薨于军中。",               marker: "薨",       expectedSubject: "李将军" },
      { sentence: "老卒殉国沙场。",                 marker: "殉",       expectedSubject: "老卒" }
    ];
    const chapter = fixtures.map(f => f.sentence).join("\n");

    // Act
    const hits = scanDeathMarkers(chapter, 20);

    // Assert 1：每条 fixture 的 marker 都有命中
    for (const f of fixtures) {
      const matched = hits.find(h => h.marker === f.marker);
      expect(matched, `marker ${f.marker} should hit`).toBeDefined();
    }

    // Assert 2：主语抽取率 ≥ 90%
    const matchedSubjects = fixtures.filter(f => {
      const hit = hits.find(h => h.marker === f.marker && h.spanStart ===
        chapter.indexOf(f.sentence) + f.sentence.indexOf(f.marker));
      return hit?.subjectCandidate === f.expectedSubject;
    });
    const rate = matchedSubjects.length / fixtures.length;
    expect(rate).toBeGreaterThanOrEqual(0.9);
  });

  it("extractSubjectCandidate：标记词位于开头 → null", () => {
    expect(extractSubjectCandidate("病逝于途中", 0)).toBeNull();
  });

  it("extractSubjectCandidate：窗口内无中文 token → null", () => {
    expect(extractSubjectCandidate("abc 123 病逝", 8)).toBeNull();
  });

  it("DEATH_MARKERS 常量包含全部 §0-2 规定项", () => {
    expect(DEATH_MARKERS).toContain("病逝");
    expect(DEATH_MARKERS).toContain("夭亡");
    expect(DEATH_MARKERS).toContain("圆寂");
    expect(DEATH_MARKERS.length).toBeGreaterThanOrEqual(20);
  });

  it("儒林外史第 20 回 牛布衣病逝样例 → deathChapterNo=20 候选结构正确", () => {
    // 契约 §0-2：deathChapterNo 候选写出（本任务不落库，仅校验结构）
    const chapter20 = "话说那年深秋，牛布衣客居芜湖甘露庵，染上风寒，延医服药俱无起色。\n"
      + "未及月余，牛布衣病逝于庵中，老和尚甚是痛惜，为他治办了后事。";

    const result = preprocessChapter(chapter20, 20);

    const deathHit = result.deathMarkerHits.find(h => h.marker === "病逝");
    expect(deathHit).toBeDefined();
    expect(deathHit!.chapterNo).toBe(20);
    expect(deathHit!.subjectCandidate).toBe("牛布衣");
    expect(deathHit!.rawSpan).toContain("病逝");
    // spanStart 指向原文中"病逝"的起始字符
    expect(chapter20.slice(deathHit!.spanStart, deathHit!.spanEnd)).toBe("病逝");
  });
});
