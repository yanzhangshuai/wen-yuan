/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  ReviewRelationSelectedPairDto,
  ReviewRelationTypeOptionDto
} from "@/lib/services/relation-editor";

import { RelationClaimList } from "./relation-claim-list";

const relationTypeOptions: ReviewRelationTypeOptionDto[] = [
  {
    relationTypeKey   : "teacher_of",
    label             : "师生",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["授业"],
    systemPreset      : true
  },
  {
    relationTypeKey   : "custom_fellow_townsman",
    label             : "同乡",
    direction         : "BIDIRECTIONAL",
    relationTypeSource: "CUSTOM",
    aliasLabels       : [],
    systemPreset      : false
  }
];

const selectedPair: ReviewRelationSelectedPairDto = {
  pairKey    : "persona-1::persona-2",
  leftPersona: {
    personaId  : "persona-1",
    displayName: "范进",
    aliases    : ["范举人"]
  },
  rightPersona: {
    personaId  : "persona-2",
    displayName: "周进",
    aliases    : ["周老爷"]
  },
  warnings: {
    directionConflict: false,
    intervalConflict : true
  },
  claims: [
    {
      claimId              : "claim-1",
      reviewState          : "PENDING",
      source               : "AI",
      conflictState        : "NONE",
      relationTypeKey      : "teacher_of",
      relationLabel        : "师生",
      relationTypeSource   : "PRESET",
      direction            : "FORWARD",
      effectiveChapterStart: 1,
      effectiveChapterEnd  : 2,
      chapterId            : "chapter-1",
      chapterLabel         : "第 1 回",
      timeLabel            : "乡试之前",
      evidenceSpanIds      : ["evidence-1", "evidence-2"]
    },
    {
      claimId              : "claim-2",
      reviewState          : "ACCEPTED",
      source               : "MANUAL",
      conflictState        : "ACTIVE",
      relationTypeKey      : "custom_fellow_townsman",
      relationLabel        : "同乡旧识",
      relationTypeSource   : "CUSTOM",
      direction            : "BIDIRECTIONAL",
      effectiveChapterStart: null,
      effectiveChapterEnd  : null,
      chapterId            : null,
      chapterLabel         : null,
      timeLabel            : null,
      evidenceSpanIds      : []
    }
  ]
};

/**
 * 文件定位（关系 claim 列表单测）：
 * - 锁定 selected pair 下“一条关系 claim 一行”的展示契约；
 * - 不在列表层加载 detail，点击 claim 只通知上层打开后续 Task 6 的详情 sheet。
 */
describe("RelationClaimList", () => {
  it("renders one row per relation claim without collapsing concurrent relations", () => {
    render(
      <RelationClaimList
        selectedPair={selectedPair}
        relationTypeOptions={relationTypeOptions}
        selectedClaimId={null}
        onSelectClaim={vi.fn()}
      />
    );

    const firstClaimButton = screen.getByRole("button", { name: /claim-1.*师生/ });
    const secondClaimButton = screen.getByRole("button", { name: /claim-2.*同乡旧识/ });

    expect(firstClaimButton).toBeInTheDocument();
    expect(secondClaimButton).toBeInTheDocument();
    expect(firstClaimButton).toHaveTextContent("第 1 回");
    expect(firstClaimButton).toHaveTextContent("第 1 回 - 第 2 回");
    expect(screen.getByText("乡试之前")).toBeInTheDocument();
    expect(screen.getByText("2 条证据")).toBeInTheDocument();
    expect(screen.getByText("未绑定证据")).toBeInTheDocument();
  });

  it("highlights the selected claim and notifies when a claim row is chosen", () => {
    const onSelectClaim = vi.fn();

    render(
      <RelationClaimList
        selectedPair={selectedPair}
        relationTypeOptions={relationTypeOptions}
        selectedClaimId="claim-2"
        onSelectClaim={onSelectClaim}
      />
    );

    const firstClaimButton = screen.getByRole("button", { name: /claim-1.*师生/ });
    const secondClaimButton = screen.getByRole("button", { name: /claim-2.*同乡旧识/ });

    expect(firstClaimButton).toHaveAttribute("aria-pressed", "false");
    expect(secondClaimButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(firstClaimButton);
    expect(onSelectClaim).toHaveBeenCalledWith("claim-1");
  });

  it("asks reviewers to pick a pair before showing claim rows", () => {
    render(
      <RelationClaimList
        selectedPair={null}
        relationTypeOptions={relationTypeOptions}
        selectedClaimId={null}
        onSelectClaim={vi.fn()}
      />
    );

    expect(screen.getByText("先选择一组人物关系")).toBeInTheDocument();
  });
});
