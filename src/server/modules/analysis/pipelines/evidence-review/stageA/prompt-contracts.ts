import type { PromptMessageInput } from "@/types/pipeline";

import {
  STAGE_A_PROMPT_VERSION,
  type StageAChapterPromptInput
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

function renderSegmentLine(
  input: StageAChapterPromptInput["segments"][number]
): string {
  const speakerSuffix = input.speakerHint
    ? ` speakerHint=${input.speakerHint}`
    : "";

  return [`[${input.segmentIndex}] ${input.segmentType}${speakerSuffix}`, input.rawText].join(
    "\n"
  );
}

export function buildStageAExtractionPrompt(
  input: StageAChapterPromptInput
): PromptMessageInput {
  const system = [
    "你是中国古典文学角色图谱项目的逐章证据抽取器。",
    "只依据当前章节和给定 segment 列表抽取结构化结果。",
    "不要创建正式 persona，不要跨章节强行归并身份，不要做 identity resolution，不要脑补未被当前章节支持的关系。",
    "如果证据无法唯一定位，就不要输出该条。",
    "输出必须是 JSON，不能带 Markdown 代码块，不能附加解释。",
    "每一条 mention/time/event/relation 都必须携带 evidence，格式固定为 {\"segmentIndex\": number, \"quotedText\": string}。",
    "quotedText 必须是所选 segment 内的原文连续片段。",
    "relationTypeKey 使用开放字符串，推荐 snake_case；relationLabel 保存可读中文标签。",
    "如果某条关系或事件的主语不明确，可以把 subjectMentionRef/sourceMentionRef/targetMentionRef 设为 null，而不是猜测。"
  ].join("\n");

  const user = [
    `PromptVersion: ${STAGE_A_PROMPT_VERSION}`,
    `BookId: ${input.bookId}`,
    `ChapterId: ${input.chapterId}`,
    `ChapterNo: ${input.chapterNo}`,
    `ChapterTitle: ${input.chapterTitle}`,
    "ChapterText:",
    input.chapterText,
    "PersistedSegments:",
    input.segments.map(renderSegmentLine).join("\n\n"),
    "Return JSON shape:",
    [
      "{",
      "  \"mentions\": [",
      "    {",
      "      \"mentionRef\": \"m1\",",
      "      \"surfaceText\": \"王冕\",",
      "      \"mentionKind\": \"NAMED\",",
      "      \"identityClaim\": \"SELF\",",
      "      \"aliasTypeHint\": null,",
      "      \"confidence\": 0.9,",
      "      \"evidence\": { \"segmentIndex\": 0, \"quotedText\": \"王冕\" }",
      "    }",
      "  ],",
      "  \"times\": [",
      "    {",
      "      \"timeRef\": \"t1\",",
      "      \"rawTimeText\": \"次日\",",
      "      \"timeType\": \"RELATIVE_PHASE\",",
      "      \"normalizedLabel\": \"次日\",",
      "      \"relativeOrderWeight\": null,",
      "      \"chapterRangeStart\": null,",
      "      \"chapterRangeEnd\": null,",
      "      \"confidence\": 0.7,",
      "      \"evidence\": { \"segmentIndex\": 2, \"quotedText\": \"次日\" }",
      "    }",
      "  ],",
      "  \"events\": [",
      "    {",
      "      \"eventRef\": \"e1\",",
      "      \"subjectMentionRef\": \"m1\",",
      "      \"predicate\": \"发言\",",
      "      \"objectText\": \"明日再谈\",",
      "      \"locationText\": null,",
      "      \"timeRef\": null,",
      "      \"eventCategory\": \"EVENT\",",
      "      \"narrativeLens\": \"QUOTED\",",
      "      \"confidence\": 0.8,",
      "      \"evidence\": { \"segmentIndex\": 1, \"quotedText\": \"明日再谈\" }",
      "    }",
      "  ],",
      "  \"relations\": [",
      "    {",
      "      \"relationRef\": \"r1\",",
      "      \"sourceMentionRef\": \"m1\",",
      "      \"targetMentionRef\": \"m2\",",
      "      \"relationTypeKey\": \"host_of\",",
      "      \"relationLabel\": \"接待\",",
      "      \"direction\": \"FORWARD\",",
      "      \"effectiveChapterStart\": null,",
      "      \"effectiveChapterEnd\": null,",
      "      \"timeRef\": null,",
      "      \"confidence\": 0.65,",
      "      \"evidence\": { \"segmentIndex\": 2, \"quotedText\": \"秦老来访\" }",
      "    }",
      "  ]",
      "}"
    ].join("\n"),
    "如果没有某类结果，请返回空数组，而不是省略字段。"
  ].join("\n\n");

  return { system, user };
}
