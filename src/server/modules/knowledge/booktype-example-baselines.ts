import type { BookTypeCode } from "@/generated/prisma/client";

/**
 * 文件定位（知识库种子层 / Few-shot 基线）：
 * - 作为 Stage A/B/C 运行时注入 `{bookTypeFewShots}` 占位符的"真相源"；
 * - 本文件只定义内存基线；DB 落盘由 `scripts/init-booktype-examples.ts` 负责；
 * - 运行时读取由 `src/server/modules/analysis/prompts/resolveBookTypeFewShots.ts` 负责。
 *
 * 核心契约（契约源 §0-1 / PRD §3）：
 * 1. 本文件所有 exampleInput / exampleOutput 正文**严禁**出现任何真实具名实体（人名/书名/地名）；
 * 2. 仅允许使用虚构占位名（甲某/乙公/丙先生/丁士 …）—— 与 `prompt-whitelist.ts`
 *    `ABSTRACT_PLACEHOLDER_TOKENS` 白名单严格对齐；
 * 3. 任何新增/修改必须通过 `pnpm check:fewshot-whitelist` 校验才能合入。
 *
 * 为什么文案不基于真实原著片段：
 * - 运行时 Prompt 会附带「当前书籍类型专属规则」与「章节原文」，若示例再引真实人名，
 *   LLM 会把"范进/宋江"之类外部先验带入未见书籍（过拟合风险）；
 * - 三阶段架构的验收 fixture（T08）明确禁止样例与回归样本出现同名人物（§0-1 交叉验证）。
 */

/** few-shot 可用阶段（与 Stage A/B/C baseline 的 {bookTypeFewShots} 占位符一一对应）。 */
export type BookTypeExampleStage = "STAGE_A" | "STAGE_B" | "STAGE_C";

export const BOOK_TYPE_EXAMPLE_STAGES: readonly BookTypeExampleStage[] = [
  "STAGE_A",
  "STAGE_B",
  "STAGE_C"
];

export interface BookTypeExampleBaseline {
  bookTypeCode : BookTypeCode;
  stage        : BookTypeExampleStage;
  /** 人可读标签（如"冒名识别"、"同姓分裂"），用于 Admin 列表展示与日志溯源。 */
  label        : string;
  /** few-shot 输入片段：章节原文或候选组等阶段输入的最小示例。 */
  exampleInput : string;
  /** few-shot 期望输出（JSON 字符串，调用方可 JSON.parse 后对照 schema）。 */
  exampleOutput: string;
  /** 可选注释：标注示例覆盖的契约要点，便于人工审阅。 */
  note?        : string;
  /** 拼接优先级：数字越大越靠前；默认 0。 */
  priority?    : number;
}

/* =============================================================================
 * 为避免代码膨胀，这里把「JSON 期望输出」压成字符串存储；
 * 运行时注入不要求 re-parse，只需与 baseline 正文字节一致。
 * ========================================================================== */

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/* ---------- CLASSICAL_NOVEL（世情讽刺类：称谓丰富 / 冒名 / 族内同辈） ------ */

const CLASSICAL_A: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "CLASSICAL_NOVEL",
    stage       : "STAGE_A",
    label       : "冒名识别-世情",
    priority    : 30,
    note        : "冒名进城，alias 必须标 IMPERSONATED_IDENTITY + SELF。",
    exampleInput: [
      "第 1 章",
      "……甲某窃得乙公文牒，径自进城赴宴。途中遇人，自称乙公，众皆唯唯。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "甲某",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "甲某窃得乙公文牒",
          actionVerb         : "窃",
          confidence         : 0.94
        },
        {
          surfaceForm        : "乙公",
          aliasType          : "IMPERSONATED_IDENTITY",
          identityClaim      : "IMPERSONATING",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: "乙公",
          evidenceRawSpan    : "自称乙公",
          actionVerb         : "称",
          confidence         : 0.9
        }
      ]
    })
  },
  {
    bookTypeCode: "CLASSICAL_NOVEL",
    stage       : "STAGE_A",
    label       : "族内同辈-世情",
    priority    : 20,
    note        : "同姓同辈需各自成条，禁合并。",
    exampleInput: [
      "第 2 章",
      "甲先生携二子入京，长子名某甲，次子名某乙。某甲道：小弟此来只为赴考。某乙在旁默然。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "甲先生",
          aliasType          : "COURTESY_NAME",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "甲先生携二子入京",
          actionVerb         : "携",
          confidence         : 0.88
        },
        {
          surfaceForm        : "某甲",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "DIALOGUE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "某甲道：小弟此来只为赴考",
          actionVerb         : "道",
          confidence         : 0.91
        },
        {
          surfaceForm        : "某乙",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "某乙在旁默然",
          actionVerb         : "在",
          confidence         : 0.88
        }
      ]
    })
  },
  {
    bookTypeCode: "CLASSICAL_NOVEL",
    stage       : "STAGE_A",
    label       : "泛化称谓-世情",
    priority    : 10,
    note        : "泛化称谓 + 具体人物对位，需给 suspectedResolvesTo。",
    exampleInput: [
      "第 3 章",
      "老爷自书斋来，家人传语：相公请用茶。丫鬟退下。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "老爷",
          aliasType          : "TITLE",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: "甲某",
          evidenceRawSpan    : "老爷自书斋来",
          actionVerb         : "来",
          confidence         : 0.7
        },
        {
          surfaceForm        : "相公",
          aliasType          : "KINSHIP",
          identityClaim      : "QUOTED",
          narrativeRegionType: "DIALOGUE",
          suspectedResolvesTo: "甲某",
          evidenceRawSpan    : "相公请用茶",
          actionVerb         : "请",
          confidence         : 0.72
        }
      ]
    })
  }
];

const CLASSICAL_B: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "CLASSICAL_NOVEL",
    stage       : "STAGE_B",
    label       : "冒名分立-世情",
    priority    : 30,
    note        : "IMPERSONATED_IDENTITY 必须 KEEP_SEPARATE。",
    exampleInput: json({
      groups: [
        {
          groupId   : 1,
          candidates: [
            { surfaceForm: "甲某", aliasType: "NAMED", source: "stage_a" },
            { surfaceForm: "乙公", aliasType: "IMPERSONATED_IDENTITY", source: "stage_a" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "甲某",
          memberSurfaceForms: ["甲某"],
          action            : "KEEP_SEPARATE",
          evidence          : "甲某冒称乙公，两人身份需分立；aliasType=IMPERSONATED_IDENTITY",
          confidence        : 0.93
        },
        {
          canonicalName     : "乙公",
          memberSurfaceForms: ["乙公"],
          action            : "KEEP_SEPARATE",
          evidence          : "乙公为被冒用原主，独立 persona",
          confidence        : 0.9
        }
      ]
    })
  },
  {
    bookTypeCode: "CLASSICAL_NOVEL",
    stage       : "STAGE_B",
    label       : "同姓族 SPLIT-世情",
    priority    : 20,
    note        : "同姓兄弟必须 KEEP_SEPARATE。",
    exampleInput: json({
      groups: [
        {
          groupId   : 2,
          candidates: [
            { surfaceForm: "某甲", aliasType: "NAMED", note: "长子" },
            { surfaceForm: "某乙", aliasType: "NAMED", note: "次子" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "某甲",
          memberSurfaceForms: ["某甲"],
          action            : "KEEP_SEPARATE",
          evidence          : "原文显示为长子次子两人",
          confidence        : 0.9
        },
        {
          canonicalName     : "某乙",
          memberSurfaceForms: ["某乙"],
          action            : "KEEP_SEPARATE",
          evidence          : "与兄长同姓不同人",
          confidence        : 0.9
        }
      ]
    })
  },
  {
    bookTypeCode: "CLASSICAL_NOVEL",
    stage       : "STAGE_B",
    label       : "称号合并-世情",
    priority    : 10,
    note        : "TITLE/COURTESY_NAME 可与真名 MERGE，需两章以上证据。",
    exampleInput: json({
      groups: [
        {
          groupId   : 3,
          candidates: [
            { surfaceForm: "甲某", aliasType: "NAMED", chapter: 1 },
            { surfaceForm: "甲先生", aliasType: "COURTESY_NAME", chapter: 2 },
            { surfaceForm: "老爷", aliasType: "TITLE", chapter: 3, suspectedResolvesTo: "甲某" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "甲某",
          memberSurfaceForms: ["甲某", "甲先生", "老爷"],
          action            : "MERGE",
          evidence          : "第1章甲某自述与第2章甲先生、第3章老爷指向一致",
          confidence        : 0.88
        }
      ]
    })
  }
];

const CLASSICAL_C: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "CLASSICAL_NOVEL",
    stage       : "STAGE_C",
    label       : "冒名事件归属-世情",
    priority    : 30,
    note        : "冒名场景下事件归 IMPERSONATING 而非 SELF。",
    exampleInput: [
      "第 1 章片段：甲某窃得乙公文牒，径自进城赴宴。",
      "已解析 persona：甲某、乙公。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "甲某",
          narrativeLens       : "IMPERSONATING",
          rawSpan             : "甲某窃得乙公文牒",
          category            : "EVENT",
          chapterNo           : 1
        }
      ]
    })
  },
  {
    bookTypeCode: "CLASSICAL_NOVEL",
    stage       : "STAGE_C",
    label       : "转述 QUOTED-世情",
    priority    : 20,
    note        : "引号内被提及的第三方事件必须归 QUOTED。",
    exampleInput: [
      "第 3 章片段：丙先生谓甲某：听闻乙公近日进京赴考。",
      "已解析 persona：甲某、丙先生、乙公。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "乙公",
          narrativeLens       : "QUOTED",
          rawSpan             : "听闻乙公近日进京赴考",
          category            : "EXAM",
          chapterNo           : 3
        }
      ]
    })
  },
  {
    bookTypeCode: "CLASSICAL_NOVEL",
    stage       : "STAGE_C",
    label       : "同名消歧-世情",
    priority    : 10,
    note        : "同名需用 canonicalName 绑定正确 persona。",
    exampleInput: [
      "第 4 章片段：某甲赴考归来，叔父某甲（同名，另一人）相迎。",
      "已解析 persona：某甲、某甲·叔父。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "某甲",
          narrativeLens       : "SELF",
          rawSpan             : "某甲赴考归来",
          category            : "EXAM",
          chapterNo           : 4
        },
        {
          personaCanonicalName: "某甲·叔父",
          narrativeLens       : "SELF",
          rawSpan             : "叔父某甲相迎",
          category            : "SOCIAL",
          chapterNo           : 4
        }
      ]
    })
  }
];

/* ---------- HEROIC_NOVEL（英雄侠义：绰号合并 / 武斗事件） ------------------ */

const HEROIC_A: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "HEROIC_NOVEL",
    stage       : "STAGE_A",
    label       : "绰号-真名-英雄",
    priority    : 30,
    exampleInput: [
      "第 5 章",
      "甲某，江湖人称乙公。是日醉酒过岗，忽闻虎啸。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "甲某",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "甲某，江湖人称乙公",
          actionVerb         : "称",
          confidence         : 0.94
        },
        {
          surfaceForm        : "乙公",
          aliasType          : "NICKNAME",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: "甲某",
          evidenceRawSpan    : "江湖人称乙公",
          actionVerb         : "称",
          confidence         : 0.88
        }
      ]
    })
  },
  {
    bookTypeCode: "HEROIC_NOVEL",
    stage       : "STAGE_A",
    label       : "兄弟同姓-英雄",
    priority    : 20,
    exampleInput: [
      "第 6 章",
      "某甲与其弟某乙同闯山寨，某甲执朴刀在前，某乙持棍在后。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "某甲",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "某甲执朴刀在前",
          actionVerb         : "执",
          confidence         : 0.92
        },
        {
          surfaceForm        : "某乙",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "某乙持棍在后",
          actionVerb         : "持",
          confidence         : 0.92
        }
      ]
    })
  },
  {
    bookTypeCode: "HEROIC_NOVEL",
    stage       : "STAGE_A",
    label       : "封号+绰号-英雄",
    priority    : 10,
    exampleInput: [
      "第 7 章",
      "众人推甲某为寨主，号曰乙丙。自此乙丙发号施令，众皆从之。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "甲某",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "众人推甲某为寨主",
          actionVerb         : "推",
          confidence         : 0.92
        },
        {
          surfaceForm        : "乙丙",
          aliasType          : "NICKNAME",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: "甲某",
          evidenceRawSpan    : "号曰乙丙",
          actionVerb         : "曰",
          confidence         : 0.86
        }
      ]
    })
  }
];

const HEROIC_B: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "HEROIC_NOVEL",
    stage       : "STAGE_B",
    label       : "绰号合并-英雄",
    priority    : 30,
    exampleInput: json({
      groups: [
        {
          groupId   : 4,
          candidates: [
            { surfaceForm: "甲某", aliasType: "NAMED", chapter: 5 },
            { surfaceForm: "乙公", aliasType: "NICKNAME", chapter: 5, suspectedResolvesTo: "甲某" },
            { surfaceForm: "乙丙", aliasType: "NICKNAME", chapter: 7, suspectedResolvesTo: "甲某" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "甲某",
          memberSurfaceForms: ["甲某", "乙公", "乙丙"],
          action            : "MERGE",
          evidence          : "第5章乙公与第7章乙丙皆显式注明为甲某之绰号",
          confidence        : 0.9
        }
      ]
    })
  },
  {
    bookTypeCode: "HEROIC_NOVEL",
    stage       : "STAGE_B",
    label       : "同姓兄弟 SPLIT-英雄",
    priority    : 20,
    exampleInput: json({
      groups: [
        {
          groupId   : 5,
          candidates: [
            { surfaceForm: "某甲", aliasType: "NAMED", chapter: 6 },
            { surfaceForm: "某乙", aliasType: "NAMED", chapter: 6, note: "其弟" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "某甲",
          memberSurfaceForms: ["某甲"],
          action            : "KEEP_SEPARATE",
          evidence          : "原文显式标注二人为兄弟",
          confidence        : 0.92
        },
        {
          canonicalName     : "某乙",
          memberSurfaceForms: ["某乙"],
          action            : "KEEP_SEPARATE",
          evidence          : "与兄长同姓不同人",
          confidence        : 0.92
        }
      ]
    })
  },
  {
    bookTypeCode: "HEROIC_NOVEL",
    stage       : "STAGE_B",
    label       : "证据不足保守-英雄",
    priority    : 10,
    note        : "仅称号相同不构成 MERGE。",
    exampleInput: json({
      groups: [
        {
          groupId   : 6,
          candidates: [
            { surfaceForm: "丙先生", aliasType: "COURTESY_NAME", chapter: 2 },
            { surfaceForm: "丙先生", aliasType: "COURTESY_NAME", chapter: 8, note: "另一场合" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "丙先生",
          memberSurfaceForms: ["丙先生"],
          action            : "KEEP_SEPARATE",
          evidence          : "仅称号相同，缺乏跨章节同身份证据",
          confidence        : 0.7
        }
      ]
    })
  }
];

const HEROIC_C: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "HEROIC_NOVEL",
    stage       : "STAGE_C",
    label       : "武斗 SELF-英雄",
    priority    : 30,
    exampleInput: [
      "第 5 章片段：甲某醉酒过岗，拳毙猛虎。",
      "已解析 persona：甲某（又名乙公）。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "甲某",
          narrativeLens       : "SELF",
          rawSpan             : "甲某醉酒过岗，拳毙猛虎",
          category            : "EVENT",
          chapterNo           : 5
        }
      ]
    })
  },
  {
    bookTypeCode: "HEROIC_NOVEL",
    stage       : "STAGE_C",
    label       : "群口转述-英雄",
    priority    : 20,
    exampleInput: [
      "第 6 章片段：众人相传：乙公昨夜独上山岗，拳毙猛虎。",
      "已解析 persona：甲某（绰号乙公）。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "甲某",
          narrativeLens       : "QUOTED",
          rawSpan             : "乙公昨夜独上山岗，拳毙猛虎",
          category            : "EVENT",
          chapterNo           : 6
        }
      ]
    })
  },
  {
    bookTypeCode: "HEROIC_NOVEL",
    stage       : "STAGE_C",
    label       : "兄弟并列事件-英雄",
    priority    : 10,
    exampleInput: [
      "第 6 章片段：某甲与某乙同闯山寨，共取金帛而归。",
      "已解析 persona：某甲、某乙。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "某甲",
          narrativeLens       : "SELF",
          rawSpan             : "某甲同闯山寨",
          category            : "EVENT",
          chapterNo           : 6
        },
        {
          personaCanonicalName: "某乙",
          narrativeLens       : "SELF",
          rawSpan             : "某乙同闯山寨",
          category            : "EVENT",
          chapterNo           : 6
        }
      ]
    })
  }
];

/* ---------- HISTORICAL_NOVEL（历史演义：姓名+字+官号） --------------------- */

const HISTORICAL_A: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "HISTORICAL_NOVEL",
    stage       : "STAGE_A",
    label       : "名+字共现-历史",
    priority    : 30,
    exampleInput: [
      "第 8 章",
      "甲某，字乙公，率众据守东郡。诸将皆呼为乙公。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "甲某",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "甲某，字乙公",
          actionVerb         : "",
          confidence         : 0.95
        },
        {
          surfaceForm        : "乙公",
          aliasType          : "COURTESY_NAME",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: "甲某",
          evidenceRawSpan    : "字乙公",
          actionVerb         : "",
          confidence         : 0.93
        }
      ]
    })
  },
  {
    bookTypeCode: "HISTORICAL_NOVEL",
    stage       : "STAGE_A",
    label       : "封号+职位-历史",
    priority    : 20,
    exampleInput: [
      "第 9 章",
      "丙先生拜为大将军，号曰丁士。自此丁士统兵。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "丙先生",
          aliasType          : "COURTESY_NAME",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "丙先生拜为大将军",
          actionVerb         : "拜",
          confidence         : 0.9
        },
        {
          surfaceForm        : "大将军",
          aliasType          : "POSITION",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: "丙先生",
          evidenceRawSpan    : "拜为大将军",
          actionVerb         : "拜",
          confidence         : 0.85
        },
        {
          surfaceForm        : "丁士",
          aliasType          : "TITLE",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: "丙先生",
          evidenceRawSpan    : "号曰丁士",
          actionVerb         : "曰",
          confidence         : 0.88
        }
      ]
    })
  },
  {
    bookTypeCode: "HISTORICAL_NOVEL",
    stage       : "STAGE_A",
    label       : "POEM HISTORICAL-历史",
    priority    : 10,
    note        : "POEM 区段 identityClaim 必须为 HISTORICAL。",
    exampleInput: [
      "第 10 章（POEM 区段）",
      "有诗为证：乙公当年定乾坤，功业悠悠传至今。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "乙公",
          aliasType          : "COURTESY_NAME",
          identityClaim      : "HISTORICAL",
          narrativeRegionType: "POEM",
          suspectedResolvesTo: "甲某",
          evidenceRawSpan    : "乙公当年定乾坤",
          actionVerb         : "定",
          confidence         : 0.78
        }
      ]
    })
  }
];

const HISTORICAL_B: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "HISTORICAL_NOVEL",
    stage       : "STAGE_B",
    label       : "名+字+官号合并-历史",
    priority    : 30,
    exampleInput: json({
      groups: [
        {
          groupId   : 7,
          candidates: [
            { surfaceForm: "甲某", aliasType: "NAMED", chapter: 8 },
            { surfaceForm: "乙公", aliasType: "COURTESY_NAME", chapter: 8, suspectedResolvesTo: "甲某" },
            { surfaceForm: "大将军", aliasType: "POSITION", chapter: 9, suspectedResolvesTo: "甲某" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "甲某",
          memberSurfaceForms: ["甲某", "乙公", "大将军"],
          action            : "MERGE",
          evidence          : "第8章显式定义字号，第9章官号与其行迹一致",
          confidence        : 0.92
        }
      ]
    })
  },
  {
    bookTypeCode: "HISTORICAL_NOVEL",
    stage       : "STAGE_B",
    label       : "GENERATIONAL 消歧-历史",
    priority    : 20,
    exampleInput: json({
      groups: [
        {
          groupId   : 8,
          candidates: [
            { surfaceForm: "甲公", aliasType: "TITLE", chapter: 2, note: "父辈" },
            { surfaceForm: "甲公", aliasType: "TITLE", chapter: 20, note: "子袭爵后同号" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "甲公·先代",
          memberSurfaceForms: ["甲公"],
          action            : "KEEP_SEPARATE",
          evidence          : "第2章甲公与第20章袭爵者相距18章且原文显示为父子",
          confidence        : 0.85
        },
        {
          canonicalName     : "甲公·袭爵",
          memberSurfaceForms: ["甲公"],
          action            : "KEEP_SEPARATE",
          evidence          : "袭爵者为子辈，与父同称号需分立",
          confidence        : 0.85
        }
      ]
    })
  },
  {
    bookTypeCode: "HISTORICAL_NOVEL",
    stage       : "STAGE_B",
    label       : "封号易主 SPLIT-历史",
    priority    : 10,
    exampleInput: json({
      groups: [
        {
          groupId   : 9,
          candidates: [
            { surfaceForm: "丁士", aliasType: "TITLE", chapter: 9, suspectedResolvesTo: "丙先生" },
            { surfaceForm: "丁士", aliasType: "TITLE", chapter: 30, suspectedResolvesTo: null, note: "易主授予他人" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "丙先生",
          memberSurfaceForms: ["丁士"],
          action            : "KEEP_SEPARATE",
          evidence          : "第9章丁士指丙先生；第30章同号已易主",
          confidence        : 0.8
        }
      ]
    })
  }
];

const HISTORICAL_C: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "HISTORICAL_NOVEL",
    stage       : "STAGE_C",
    label       : "官号行军 SELF-历史",
    priority    : 30,
    exampleInput: [
      "第 9 章片段：大将军统兵十万，出东郡。",
      "已解析 persona：丙先生（官号大将军/号丁士）。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "丙先生",
          narrativeLens       : "SELF",
          rawSpan             : "大将军统兵十万，出东郡",
          category            : "CAREER",
          chapterNo           : 9
        }
      ]
    })
  },
  {
    bookTypeCode: "HISTORICAL_NOVEL",
    stage       : "STAGE_C",
    label       : "诗赞 HISTORICAL-历史",
    priority    : 20,
    exampleInput: [
      "第 10 章 POEM 片段：有诗为证：乙公当年定乾坤。",
      "已解析 persona：甲某（字乙公）。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "甲某",
          narrativeLens       : "HISTORICAL",
          rawSpan             : "乙公当年定乾坤",
          category            : "EVENT",
          chapterNo           : 10
        }
      ]
    })
  },
  {
    bookTypeCode: "HISTORICAL_NOVEL",
    stage       : "STAGE_C",
    label       : "评议 COMMENTARY REPORTED-历史",
    priority    : 10,
    exampleInput: [
      "第 11 章 COMMENTARY 片段：论曰：甲某用兵，虽险而胜。",
      "已解析 persona：甲某。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "甲某",
          narrativeLens       : "REPORTED",
          rawSpan             : "甲某用兵，虽险而胜",
          category            : "CAREER",
          chapterNo           : 11
        }
      ]
    })
  }
];

/* ---------- MYTHOLOGICAL_NOVEL（神魔：变化 / 法号道号） -------------------- */

const MYTHO_A: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "MYTHOLOGICAL_NOVEL",
    stage       : "STAGE_A",
    label       : "变化化名-神魔",
    priority    : 30,
    note        : "变化化名 aliasType=MISIDENTIFIED_AS 或 IMPERSONATED_IDENTITY。",
    exampleInput: [
      "第 12 章",
      "甲某摇身一变，化作乙公模样，径入山寺。寺中人皆以为真乙公。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "甲某",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "甲某摇身一变",
          actionVerb         : "变",
          confidence         : 0.94
        },
        {
          surfaceForm        : "乙公",
          aliasType          : "IMPERSONATED_IDENTITY",
          identityClaim      : "IMPERSONATING",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: "乙公",
          evidenceRawSpan    : "化作乙公模样",
          actionVerb         : "化",
          confidence         : 0.9
        }
      ]
    })
  },
  {
    bookTypeCode: "MYTHOLOGICAL_NOVEL",
    stage       : "STAGE_A",
    label       : "法号道号-神魔",
    priority    : 20,
    exampleInput: [
      "第 13 章",
      "某甲入山修行，师父赐号丙先生。此后众仙皆呼其为丙先生。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "某甲",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "某甲入山修行",
          actionVerb         : "入",
          confidence         : 0.92
        },
        {
          surfaceForm        : "丙先生",
          aliasType          : "TITLE",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: "某甲",
          evidenceRawSpan    : "师父赐号丙先生",
          actionVerb         : "赐",
          confidence         : 0.88
        }
      ]
    })
  },
  {
    bookTypeCode: "MYTHOLOGICAL_NOVEL",
    stage       : "STAGE_A",
    label       : "梦境 DREAM-神魔",
    priority    : 10,
    note        : "梦境叙事，identityClaim 按实际情况（SELF/REPORTED）。",
    exampleInput: [
      "第 14 章",
      "某乙梦中见丁士执扇而立。醒后记之。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "某乙",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "某乙梦中见丁士",
          actionVerb         : "见",
          confidence         : 0.9
        },
        {
          surfaceForm        : "丁士",
          aliasType          : "UNSURE",
          identityClaim      : "REPORTED",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "梦中见丁士执扇而立",
          actionVerb         : "执",
          confidence         : 0.6
        }
      ]
    })
  }
];

const MYTHO_B: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "MYTHOLOGICAL_NOVEL",
    stage       : "STAGE_B",
    label       : "变化链分立-神魔",
    priority    : 30,
    exampleInput: json({
      groups: [
        {
          groupId   : 10,
          candidates: [
            { surfaceForm: "甲某", aliasType: "NAMED", chapter: 12 },
            { surfaceForm: "乙公", aliasType: "IMPERSONATED_IDENTITY", chapter: 12, note: "变化为乙公模样" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "甲某",
          memberSurfaceForms: ["甲某"],
          action            : "KEEP_SEPARATE",
          evidence          : "甲某变化冒充乙公，身份需分立",
          confidence        : 0.92
        },
        {
          canonicalName     : "乙公",
          memberSurfaceForms: ["乙公"],
          action            : "KEEP_SEPARATE",
          evidence          : "被冒充者为独立 persona",
          confidence        : 0.9
        }
      ]
    })
  },
  {
    bookTypeCode: "MYTHOLOGICAL_NOVEL",
    stage       : "STAGE_B",
    label       : "法号合并-神魔",
    priority    : 20,
    exampleInput: json({
      groups: [
        {
          groupId   : 11,
          candidates: [
            { surfaceForm: "某甲", aliasType: "NAMED", chapter: 13 },
            { surfaceForm: "丙先生", aliasType: "TITLE", chapter: 13, suspectedResolvesTo: "某甲" },
            { surfaceForm: "丙先生", aliasType: "TITLE", chapter: 15, suspectedResolvesTo: "某甲" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "某甲",
          memberSurfaceForms: ["某甲", "丙先生"],
          action            : "MERGE",
          evidence          : "赐号明确，跨章延续同一人",
          confidence        : 0.9
        }
      ]
    })
  },
  {
    bookTypeCode: "MYTHOLOGICAL_NOVEL",
    stage       : "STAGE_B",
    label       : "转世同号 SPLIT-神魔",
    priority    : 10,
    exampleInput: json({
      groups: [
        {
          groupId   : 12,
          candidates: [
            { surfaceForm: "丁士", aliasType: "TITLE", chapter: 14, note: "前身" },
            { surfaceForm: "丁士", aliasType: "TITLE", chapter: 40, note: "转世后同号，实为新身" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "丁士·前身",
          memberSurfaceForms: ["丁士"],
          action            : "KEEP_SEPARATE",
          evidence          : "转世叙事明确：同号不同身",
          confidence        : 0.78
        }
      ]
    })
  }
];

const MYTHO_C: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "MYTHOLOGICAL_NOVEL",
    stage       : "STAGE_C",
    label       : "变化 IMPERSONATING-神魔",
    priority    : 30,
    exampleInput: [
      "第 12 章片段：甲某化作乙公模样进入山寺，窃得灵丹。",
      "已解析 persona：甲某、乙公。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "甲某",
          narrativeLens       : "IMPERSONATING",
          rawSpan             : "甲某化作乙公模样进入山寺，窃得灵丹",
          category            : "EVENT",
          chapterNo           : 12
        }
      ]
    })
  },
  {
    bookTypeCode: "MYTHOLOGICAL_NOVEL",
    stage       : "STAGE_C",
    label       : "梦境归属-神魔",
    priority    : 20,
    note        : "DREAM 内事件归 REPORTED 或 SELF 取决于视角；此处以梦主视角 SELF。",
    exampleInput: [
      "第 14 章片段：某乙梦中见丁士传授秘法。",
      "已解析 persona：某乙、丁士。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "某乙",
          narrativeLens       : "SELF",
          rawSpan             : "某乙梦中见丁士传授秘法",
          category            : "EVENT",
          chapterNo           : 14
        }
      ]
    })
  },
  {
    bookTypeCode: "MYTHOLOGICAL_NOVEL",
    stage       : "STAGE_C",
    label       : "法号出行-神魔",
    priority    : 10,
    exampleInput: [
      "第 15 章片段：丙先生腾云而起，往南海而去。",
      "已解析 persona：某甲（法号丙先生）。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "某甲",
          narrativeLens       : "SELF",
          rawSpan             : "丙先生腾云而起，往南海而去",
          category            : "TRAVEL",
          chapterNo           : 15
        }
      ]
    })
  }
];

/* ---------- GENERIC（通用兜底） ------------------------------------------- */

const GENERIC_A: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "GENERIC",
    stage       : "STAGE_A",
    label       : "基础对白-通用",
    priority    : 30,
    exampleInput: [
      "第 1 章",
      "甲某推门而入。乙公道：来得正好。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "甲某",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "甲某推门而入",
          actionVerb         : "推",
          confidence         : 0.95
        },
        {
          surfaceForm        : "乙公",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "DIALOGUE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "乙公道：来得正好",
          actionVerb         : "道",
          confidence         : 0.94
        }
      ]
    })
  },
  {
    bookTypeCode: "GENERIC",
    stage       : "STAGE_A",
    label       : "第三方引述-通用",
    priority    : 20,
    exampleInput: [
      "第 2 章",
      "丙先生对甲某讲：昨日见丁士归来。"
    ].join("\n"),
    exampleOutput: json({
      mentions: [
        {
          surfaceForm        : "丙先生",
          aliasType          : "COURTESY_NAME",
          identityClaim      : "SELF",
          narrativeRegionType: "DIALOGUE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "丙先生对甲某讲",
          actionVerb         : "讲",
          confidence         : 0.92
        },
        {
          surfaceForm        : "甲某",
          aliasType          : "NAMED",
          identityClaim      : "QUOTED",
          narrativeRegionType: "DIALOGUE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "丙先生对甲某讲",
          actionVerb         : "",
          confidence         : 0.82
        },
        {
          surfaceForm        : "丁士",
          aliasType          : "NAMED",
          identityClaim      : "QUOTED",
          narrativeRegionType: "DIALOGUE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "昨日见丁士归来",
          actionVerb         : "归",
          confidence         : 0.82
        }
      ]
    })
  },
  {
    bookTypeCode: "GENERIC",
    stage       : "STAGE_A",
    label       : "泛化代词-通用",
    priority    : 10,
    exampleInput: [
      "第 3 章",
      "他缓缓走来，众人皆不识。"
    ].join("\n"),
    exampleOutput: json({
      mentions: []
    })
  }
];

const GENERIC_B: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "GENERIC",
    stage       : "STAGE_B",
    label       : "基础合并-通用",
    priority    : 30,
    exampleInput: json({
      groups: [
        {
          groupId   : 13,
          candidates: [
            { surfaceForm: "甲某", aliasType: "NAMED", chapter: 1 },
            { surfaceForm: "甲某", aliasType: "NAMED", chapter: 2 }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "甲某",
          memberSurfaceForms: ["甲某"],
          action            : "MERGE",
          evidence          : "同名跨章节出现且无分立线索",
          confidence        : 0.88
        }
      ]
    })
  },
  {
    bookTypeCode: "GENERIC",
    stage       : "STAGE_B",
    label       : "称号合并-通用",
    priority    : 20,
    exampleInput: json({
      groups: [
        {
          groupId   : 14,
          candidates: [
            { surfaceForm: "丙先生", aliasType: "COURTESY_NAME", chapter: 2, suspectedResolvesTo: "某丙" },
            { surfaceForm: "某丙", aliasType: "NAMED", chapter: 5 }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "某丙",
          memberSurfaceForms: ["某丙", "丙先生"],
          action            : "MERGE",
          evidence          : "第2章丙先生与第5章某丙行迹一致",
          confidence        : 0.86
        }
      ]
    })
  },
  {
    bookTypeCode: "GENERIC",
    stage       : "STAGE_B",
    label       : "同名分立-通用",
    priority    : 10,
    exampleInput: json({
      groups: [
        {
          groupId   : 15,
          candidates: [
            { surfaceForm: "丁士", aliasType: "NAMED", chapter: 3, note: "场景 A" },
            { surfaceForm: "丁士", aliasType: "NAMED", chapter: 9, note: "场景 B：不同职业背景" }
          ]
        }
      ]
    }),
    exampleOutput: json({
      decisions: [
        {
          canonicalName     : "丁士·甲",
          memberSurfaceForms: ["丁士"],
          action            : "KEEP_SEPARATE",
          evidence          : "两章背景矛盾，无法确认同一人",
          confidence        : 0.72
        }
      ]
    })
  }
];

const GENERIC_C: BookTypeExampleBaseline[] = [
  {
    bookTypeCode: "GENERIC",
    stage       : "STAGE_C",
    label       : "基础 SELF-通用",
    priority    : 30,
    exampleInput: [
      "第 1 章片段：甲某推门而入。",
      "已解析 persona：甲某、乙公。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "甲某",
          narrativeLens       : "SELF",
          rawSpan             : "甲某推门而入",
          category            : "EVENT",
          chapterNo           : 1
        }
      ]
    })
  },
  {
    bookTypeCode: "GENERIC",
    stage       : "STAGE_C",
    label       : "引号 QUOTED-通用",
    priority    : 20,
    exampleInput: [
      "第 2 章片段：丙先生对甲某讲：昨日见丁士归来。",
      "已解析 persona：丙先生、甲某、丁士。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "丁士",
          narrativeLens       : "QUOTED",
          rawSpan             : "昨日见丁士归来",
          category            : "TRAVEL",
          chapterNo           : 2
        }
      ]
    })
  },
  {
    bookTypeCode: "GENERIC",
    stage       : "STAGE_C",
    label       : "多 persona 并列-通用",
    priority    : 10,
    exampleInput: [
      "第 4 章片段：甲某与乙公共赴宴，丙先生迎于门外。",
      "已解析 persona：甲某、乙公、丙先生。"
    ].join("\n"),
    exampleOutput: json({
      records: [
        {
          personaCanonicalName: "甲某",
          narrativeLens       : "SELF",
          rawSpan             : "甲某与乙公共赴宴",
          category            : "SOCIAL",
          chapterNo           : 4
        },
        {
          personaCanonicalName: "乙公",
          narrativeLens       : "SELF",
          rawSpan             : "甲某与乙公共赴宴",
          category            : "SOCIAL",
          chapterNo           : 4
        },
        {
          personaCanonicalName: "丙先生",
          narrativeLens       : "SELF",
          rawSpan             : "丙先生迎于门外",
          category            : "SOCIAL",
          chapterNo           : 4
        }
      ]
    })
  }
];

/**
 * 汇总 baseline 数组（契约 §0-F.3：5 × 3 × ≥3 = 至少 45 条）。
 * 顺序即导入顺序；运行时 resolveBookTypeFewShots 按 (priority DESC, createdAt ASC) 返回前 N 条。
 */
export const BOOK_TYPE_EXAMPLE_BASELINES: readonly BookTypeExampleBaseline[] = [
  ...CLASSICAL_A, ...CLASSICAL_B, ...CLASSICAL_C,
  ...HEROIC_A,    ...HEROIC_B,    ...HEROIC_C,
  ...HISTORICAL_A,...HISTORICAL_B,...HISTORICAL_C,
  ...MYTHO_A,     ...MYTHO_B,     ...MYTHO_C,
  ...GENERIC_A,   ...GENERIC_B,   ...GENERIC_C
];
