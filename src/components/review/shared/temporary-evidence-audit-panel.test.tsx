/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type {
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse
} from "@/lib/services/review-matrix";

import { TemporaryEvidenceAuditPanel } from "./temporary-evidence-audit-panel";

function buildClaim(overrides: Partial<ReviewClaimDetailRecord> = {}): ReviewClaimDetailRecord {
  return {
    id                 : "claim-1",
    claimId            : "claim-1",
    claimKind          : "EVENT",
    bookId             : "book-1",
    chapterId          : "chapter-3",
    reviewState        : "PENDING",
    source             : "AI",
    conflictState      : "NONE",
    createdAt          : "2026-04-21T10:00:00.000Z",
    updatedAt          : "2026-04-21T10:00:00.000Z",
    personaCandidateIds: ["candidate-1"],
    personaIds         : ["persona-1"],
    timeLabel          : null,
    relationTypeKey    : null,
    evidenceSpanIds    : ["evidence-1"],
    derivedFromClaimId : null,
    ...overrides
  };
}

function buildDetail(
  overrides: Partial<ReviewClaimDetailResponse> = {}
): ReviewClaimDetailResponse {
  return {
    claim            : buildClaim(),
    evidence         : [],
    basisClaim       : null,
    projectionSummary: {
      personaChapterFacts: [],
      personaTimeFacts   : [],
      relationshipEdges  : [],
      timelineEvents     : []
    },
    auditHistory: [],
    ...overrides
  };
}

/**
 * 文件定位（临时证据/审计面板单测）：
 * - 该组件只是 T13 对 T12 detail DTO 的临时展示适配层，重点锁定可审查信息是否可见。
 * - 测试不绑定最终布局细节，只验证 reviewer 最关心的证据、AI 依据、审计顺序与空态。
 */
describe("TemporaryEvidenceAuditPanel", () => {
  it("shows evidence spans and AI basis summary when detail data is available", () => {
    render(
      <TemporaryEvidenceAuditPanel
        detail={buildDetail({
          evidence: [
            {
              id                 : "evidence-1",
              chapterId          : "chapter-3",
              startOffset        : 12,
              endOffset          : 28,
              quotedText         : "范进叩首称谢，众人都道喜。",
              normalizedText     : "范进叩首称谢，众人都道喜。",
              speakerHint        : "张乡绅",
              narrativeRegionType: "DIALOGUE_CONTENT",
              createdAt          : "2026-04-21T09:00:00.000Z"
            }
          ],
          basisClaim: buildClaim({
            id             : "claim-basis-1",
            claimId        : "claim-basis-1",
            claimKind      : "RELATION",
            reviewState    : "ACCEPTED",
            relationTypeKey: "mentor_of",
            timeLabel      : "中举之后"
          })
        })}
      />
    );

    expect(screen.getByRole("heading", { name: "原文证据" })).toBeInTheDocument();
    expect(screen.getByText("范进叩首称谢，众人都道喜。")).toBeInTheDocument();
    expect(screen.getByText(/对白/)).toBeInTheDocument();
    expect(screen.getByText(/张乡绅/)).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "AI 提取依据" })).toBeInTheDocument();
    expect(screen.getByText("关系")).toBeInTheDocument();
    expect(screen.getByText("关系类型：mentor_of")).toBeInTheDocument();
    expect(screen.getByText("时间：中举之后")).toBeInTheDocument();
  });

  it("renders audit history newest-first and labels that order clearly", () => {
    render(
      <TemporaryEvidenceAuditPanel
        detail={buildDetail({
          auditHistory: [
            {
              id             : "audit-older",
              action         : "ACCEPT",
              actorUserId    : "reviewer-1",
              note           : "较早确认",
              evidenceSpanIds: ["evidence-1"],
              beforeState    : { reviewState: "PENDING" },
              afterState     : { reviewState: "ACCEPTED" },
              createdAt      : "2026-04-21T08:00:00.000Z"
            },
            {
              id             : "audit-newer",
              action         : "EDIT",
              actorUserId    : "reviewer-2",
              note           : "后续修订",
              evidenceSpanIds: ["evidence-2", "evidence-3"],
              beforeState    : { relationTypeKey: "friend_of" },
              afterState     : { relationTypeKey: "mentor_of" },
              createdAt      : "2026-04-21T09:30:00.000Z"
            }
          ]
        })}
      />
    );

    expect(screen.getByText("审核记录（最新在上）")).toBeInTheDocument();

    const items = screen.getAllByTestId("temporary-audit-item");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("后续修订")).toBeInTheDocument();
    expect(within(items[1]).getByText("较早确认")).toBeInTheDocument();
  });

  it("shows explicit empty states when evidence and audit data are absent", () => {
    render(<TemporaryEvidenceAuditPanel detail={buildDetail()} />);

    expect(screen.getByText("暂无原文证据")).toBeInTheDocument();
    expect(screen.getByText("暂无 AI 依据")).toBeInTheDocument();
    expect(screen.getByText("暂无审核记录")).toBeInTheDocument();
  });
});
