/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PersonaChapterMatrixChapterDto,
  PersonaChapterMatrixPersonaDto,
  PersonaChapterRelationTypeOptionDto
} from "@/lib/services/review-matrix";

import { ManualClaimForm } from "./manual-claim-form";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const EVIDENCE_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE_PERSONA_ID = "55555555-5555-4555-8555-555555555555";
const TARGET_PERSONA_ID = "66666666-6666-4666-8666-666666666666";
const SOURCE_CANDIDATE_ID = "77777777-7777-4777-8777-777777777777";
const TARGET_CANDIDATE_ID = "88888888-8888-4888-8888-888888888888";

const hoisted = vi.hoisted(() => ({
  createManualReviewClaimMock: vi.fn()
}));

vi.mock("@/lib/services/review-matrix", async () => {
  const actual = await vi.importActual("@/lib/services/review-matrix");

  return {
    ...actual,
    createManualReviewClaim: hoisted.createManualReviewClaimMock
  };
});

function buildPersona(
  overrides: Partial<PersonaChapterMatrixPersonaDto> = {}
): PersonaChapterMatrixPersonaDto {
  return {
    personaId                : SOURCE_PERSONA_ID,
    displayName              : "范进",
    aliases                  : ["范举人"],
    primaryPersonaCandidateId: SOURCE_CANDIDATE_ID,
    personaCandidateIds      : [SOURCE_CANDIDATE_ID],
    firstChapterNo           : 1,
    totalEventCount          : 2,
    totalRelationCount       : 1,
    totalConflictCount       : 0,
    ...overrides
  };
}

function buildTargetPersona(): PersonaChapterMatrixPersonaDto {
  return buildPersona({
    personaId                : TARGET_PERSONA_ID,
    displayName              : "周进",
    aliases                  : ["周老爷"],
    primaryPersonaCandidateId: TARGET_CANDIDATE_ID,
    personaCandidateIds      : [TARGET_CANDIDATE_ID],
    firstChapterNo           : 2,
    totalEventCount          : 1,
    totalRelationCount       : 0,
    totalConflictCount       : 0
  });
}

function buildChapter(
  overrides: Partial<PersonaChapterMatrixChapterDto> = {}
): PersonaChapterMatrixChapterDto {
  return {
    chapterId: CHAPTER_ID,
    chapterNo: 1,
    title    : "学道登场",
    label    : "第 1 回",
    ...overrides
  };
}

const relationOptions: PersonaChapterRelationTypeOptionDto[] = [
  {
    relationTypeKey   : "mentor_of",
    label             : "提携",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["举荐"],
    systemPreset      : true
  },
  {
    relationTypeKey   : "friend_of",
    label             : "朋友",
    direction         : "BIDIRECTIONAL",
    relationTypeSource: "PRESET",
    aliasLabels       : [],
    systemPreset      : true
  }
];

function renderForm(
  overrides: Partial<React.ComponentProps<typeof ManualClaimForm>> = {}
) {
  const persona = buildPersona();
  const targetPersona = buildTargetPersona();

  return render(
    <ManualClaimForm
      bookId={BOOK_ID}
      persona={persona}
      chapter={buildChapter()}
      personas={[persona, targetPersona]}
      relationTypeOptions={relationOptions}
      onMutationSuccess={vi.fn()}
      {...overrides}
    />
  );
}

/**
 * 文件定位（T13 Task 9 人工补录表单单测）：
 * - 锁定抽屉内“新增事迹/新增关系”的 claim-first 写入契约；
 * - 表单只组装 T12 manual claim draft，不直接更新本地矩阵事实。
 */
describe("ManualClaimForm", () => {
  beforeEach(() => {
    hoisted.createManualReviewClaimMock.mockReset();
  });

  it("creates an event with selected book, chapter, persona candidate, confidence, and evidence", async () => {
    const onMutationSuccess = vi.fn();
    hoisted.createManualReviewClaimMock.mockResolvedValueOnce({ id: "manual-event-1" });

    renderForm({ onMutationSuccess });

    fireEvent.click(screen.getByRole("button", { name: "新增事迹" }));
    fireEvent.change(screen.getByRole("textbox", { name: "运行 ID（临时必填）" }), {
      target: { value: RUN_ID }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "证据 Span IDs（临时必填）" }), {
      target: { value: EVIDENCE_ID }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "事迹谓语" }), {
      target: { value: "中举" }
    });
    fireEvent.click(screen.getByRole("button", { name: "创建事迹" }));

    await waitFor(() => {
      expect(hoisted.createManualReviewClaimMock).toHaveBeenCalledWith({
        claimKind: "EVENT",
        note     : null,
        draft    : expect.objectContaining({
          bookId                   : BOOK_ID,
          chapterId                : CHAPTER_ID,
          confidence               : 1,
          runId                    : RUN_ID,
          subjectMentionId         : null,
          subjectPersonaCandidateId: SOURCE_CANDIDATE_ID,
          predicate                : "中举",
          objectText               : null,
          objectPersonaCandidateId : null,
          locationText             : null,
          timeHintId               : null,
          eventCategory            : "EVENT",
          narrativeLens            : "SELF",
          evidenceSpanIds          : [EVIDENCE_ID]
        })
      });
    });
    expect(onMutationSuccess).toHaveBeenCalledTimes(1);
  });

  it("creates a relation using a target persona and preset relation type", async () => {
    hoisted.createManualReviewClaimMock.mockResolvedValueOnce({ id: "manual-relation-1" });

    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "新增关系" }));
    fireEvent.change(screen.getByRole("textbox", { name: "运行 ID（临时必填）" }), {
      target: { value: RUN_ID }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "证据 Span IDs（临时必填）" }), {
      target: { value: EVIDENCE_ID }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "目标人物" }), {
      target: { value: TARGET_PERSONA_ID }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "关系类型" }), {
      target: { value: "mentor_of" }
    });
    fireEvent.click(screen.getByRole("button", { name: "创建关系" }));

    await waitFor(() => {
      expect(hoisted.createManualReviewClaimMock).toHaveBeenCalledWith({
        claimKind: "RELATION",
        note     : null,
        draft    : expect.objectContaining({
          bookId                  : BOOK_ID,
          chapterId               : CHAPTER_ID,
          confidence              : 1,
          runId                   : RUN_ID,
          sourceMentionId         : null,
          targetMentionId         : null,
          sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
          targetPersonaCandidateId: TARGET_CANDIDATE_ID,
          relationTypeKey         : "mentor_of",
          relationLabel           : "提携",
          relationTypeSource      : "PRESET",
          direction               : "FORWARD",
          effectiveChapterStart   : 1,
          effectiveChapterEnd     : null,
          timeHintId              : null,
          evidenceSpanIds         : [EVIDENCE_ID]
        })
      });
    });
  });

  it("allows a custom relation type key and label when presets do not fit", async () => {
    hoisted.createManualReviewClaimMock.mockResolvedValueOnce({ id: "manual-relation-2" });

    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "新增关系" }));
    fireEvent.change(screen.getByRole("textbox", { name: "运行 ID（临时必填）" }), {
      target: { value: RUN_ID }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "证据 Span IDs（临时必填）" }), {
      target: { value: EVIDENCE_ID }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "目标人物" }), {
      target: { value: TARGET_PERSONA_ID }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "关系类型" }), {
      target: { value: "__custom__" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "自定义关系 Key" }), {
      target: { value: "same_clan_of" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "自定义关系名称" }), {
      target: { value: "同宗" }
    });
    fireEvent.click(screen.getByRole("button", { name: "创建关系" }));

    await waitFor(() => {
      expect(hoisted.createManualReviewClaimMock).toHaveBeenCalledWith(expect.objectContaining({
        claimKind: "RELATION",
        draft    : expect.objectContaining({
          relationTypeKey   : "same_clan_of",
          relationLabel     : "同宗",
          relationTypeSource: "CUSTOM",
          direction         : "FORWARD"
        })
      }));
    });
  });

  it("disables manual creation with a clear message when the selected persona has no candidate id", () => {
    renderForm({
      persona: buildPersona({
        primaryPersonaCandidateId: null,
        personaCandidateIds      : []
      })
    });

    expect(screen.getByText("当前人物没有 primary persona candidate id，暂不能补录 claim。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增事迹" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "新增关系" })).toBeDisabled();
  });

  it("keeps the form open and shows an error when manual creation fails", async () => {
    hoisted.createManualReviewClaimMock.mockRejectedValueOnce(new Error("manual create failed"));

    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "新增事迹" }));
    fireEvent.change(screen.getByRole("textbox", { name: "运行 ID（临时必填）" }), {
      target: { value: RUN_ID }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "证据 Span IDs（临时必填）" }), {
      target: { value: EVIDENCE_ID }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "事迹谓语" }), {
      target: { value: "赴试" }
    });
    fireEvent.click(screen.getByRole("button", { name: "创建事迹" }));

    expect(await screen.findByText("manual create failed")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "事迹谓语" })).toHaveValue("赴试");
  });
});
