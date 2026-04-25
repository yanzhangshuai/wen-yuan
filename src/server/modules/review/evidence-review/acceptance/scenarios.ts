import {
  RULIN_BASELINE_RUN_ID,
  RULIN_BOOK_ID,
  RULIN_CANDIDATE_RUN_ID,
  SANGUO_BASELINE_RUN_ID,
  SANGUO_BOOK_ID,
  SANGUO_CANDIDATE_RUN_ID
} from "@/server/modules/review/evidence-review/regression/sample-seed";

export const FINAL_ACCEPTANCE_REPORT_PATHS = {
  markdownPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md",
  jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json"
} as const;

export const ACCEPTANCE_SCENARIOS = [
  {
    scenarioKey          : "rulin-waishi-sample",
    sampleBookId         : RULIN_BOOK_ID,
    baselineRunId        : RULIN_BASELINE_RUN_ID,
    candidateRunId       : RULIN_CANDIDATE_RUN_ID,
    bookTitle            : "儒林外史",
    fixturePath          : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
    manualObservationPath: "docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json",
    reportPaths          : {
      markdownPath: "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md",
      jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json"
    },
    referenceReports: {
      t20TaskPath    : "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
      t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
      t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
    },
    manualChecks: [
      {
        checkKey           : "persona-chapter-evidence-jump",
        routeKind          : "personaChapter",
        expectedObservation: "人物x章节矩阵可打开共享明细面板并跳转原文证据。"
      },
      {
        checkKey           : "relation-editor-evidence-jump",
        routeKind          : "relationEditor",
        expectedObservation: "关系编辑页可查看方向、生效区间与证据原文。"
      },
      {
        checkKey           : "persona-time-evidence-jump",
        routeKind          : "personaTime",
        expectedObservation: "人物x时间矩阵可打开共享明细面板并查看关联章节。"
      }
    ]
  },
  {
    scenarioKey          : "sanguo-yanyi-sample",
    sampleBookId         : SANGUO_BOOK_ID,
    baselineRunId        : SANGUO_BASELINE_RUN_ID,
    candidateRunId       : SANGUO_CANDIDATE_RUN_ID,
    bookTitle            : "三国演义",
    fixturePath          : "tests/fixtures/review-regression/sanguo-yanyi.fixture.json",
    manualObservationPath: "docs/superpowers/reports/evidence-review-acceptance/manual-checks/sanguo-yanyi-sample.json",
    reportPaths          : {
      markdownPath: "docs/superpowers/reports/evidence-review-acceptance/sanguo-yanyi-sample/summary.md",
      jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/sanguo-yanyi-sample/summary.json"
    },
    referenceReports: {
      t20TaskPath    : "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
      t21MarkdownPath: "docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.md",
      t21JsonPath    : "docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.json"
    },
    manualChecks: [
      {
        checkKey           : "persona-chapter-evidence-jump",
        routeKind          : "personaChapter",
        expectedObservation: "人物x章节矩阵可追到战役相关原文。"
      },
      {
        checkKey           : "relation-editor-evidence-jump",
        routeKind          : "relationEditor",
        expectedObservation: "关系页可编辑动态关系并保留方向。"
      },
      {
        checkKey           : "persona-time-evidence-jump",
        routeKind          : "personaTime",
        expectedObservation: "人物x时间矩阵可展示模糊时间片并回跳章节。"
      }
    ]
  }
] as const;
