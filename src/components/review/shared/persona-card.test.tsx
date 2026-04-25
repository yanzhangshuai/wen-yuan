/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PersonaCard } from "./persona-card";
import { type PersonaListItem } from "./persona-list-summary";

function item(over: Partial<PersonaListItem> = {}): PersonaListItem {
  return {
    personaId          : "p1",
    displayName        : "周进",
    aliases            : ["字蒙夜", "周老爹"],
    firstChapterNo     : 2,
    totalEventCount    : 24,
    totalRelationCount : 8,
    totalConflictCount : 0,
    pendingClaimCount  : 0,
    personaCandidateIds: ["pc1"],
    ...over
  };
}

describe("PersonaCard", () => {
  it("展示 displayName / aliases / firstChapter / 计数", () => {
    render(<PersonaCard item={item()} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByText("周进")).toBeInTheDocument();
    expect(screen.getByText(/字蒙夜/)).toBeInTheDocument();
    expect(screen.getByText(/第2回/)).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("totalConflictCount > 0 时显示冲突徽标", () => {
    render(<PersonaCard item={item({ totalConflictCount: 3 })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByLabelText(/冲突 3/)).toBeInTheDocument();
  });

  it("personaCandidateIds 长度 > 1 时显示合并候选徽标", () => {
    render(<PersonaCard item={item({ personaCandidateIds: ["a", "b"] })} isSelected={false} onSelect={vi.fn()} />);
    expect(screen.getByLabelText(/未消解候选/)).toBeInTheDocument();
  });

  it("点击触发 onSelect(personaId)", async () => {
    const onSelect = vi.fn();
    render(<PersonaCard item={item()} isSelected={false} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("isSelected → role=option 且 aria-selected=true", () => {
    render(<PersonaCard item={item()} isSelected onSelect={vi.fn()} />);
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
  });
});
