/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildClaimDetail } from "./test-fixtures";
import { ReviewClaimDetailPanel } from "./review-claim-detail-panel";

describe("ReviewClaimDetailPanel", () => {
  it("renders the shared reviewer-first detail surface for evidence, ai basis, version diff, and audit history", () => {
    render(<ReviewClaimDetailPanel detail={buildClaimDetail()} />);

    expect(screen.getByTestId("review-claim-detail-panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "原文证据" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI 提取依据" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "版本差异" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "审核记录（最新在上）" })).toBeInTheDocument();
  });
});
