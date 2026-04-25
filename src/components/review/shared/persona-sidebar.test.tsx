/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PersonaSidebar } from "./persona-sidebar";
import { type PersonaListItem } from "./persona-list-summary";

function p(over: Partial<PersonaListItem>): PersonaListItem {
  return {
    personaId          : over.personaId ?? "x",
    displayName        : over.displayName ?? "x",
    aliases            : over.aliases ?? [],
    firstChapterNo     : over.firstChapterNo ?? null,
    totalEventCount    : over.totalEventCount ?? 0,
    totalRelationCount : over.totalRelationCount ?? 0,
    totalConflictCount : over.totalConflictCount ?? 0,
    pendingClaimCount  : over.pendingClaimCount ?? 0,
    personaCandidateIds: over.personaCandidateIds ?? []
  };
}

const items = [
  p({ personaId: "a", displayName: "周进",     firstChapterNo: 2,  pendingClaimCount: 4, totalEventCount: 24 }),
  p({ personaId: "b", displayName: "范进",     firstChapterNo: 3,  pendingClaimCount: 0, totalEventCount: 30 }),
  p({ personaId: "c", displayName: "马二先生", aliases: ["马纯上"], firstChapterNo: 13, pendingClaimCount: 0, totalConflictCount: 1 })
];

describe("PersonaSidebar", () => {
  it("默认按 firstChapter 升序渲染所有角色", () => {
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={vi.fn()} />);
    const options = screen.getAllByRole("option");
    expect(options.map((o) => within(o).getByText(/周进|范进|马二先生/).textContent)).toEqual([
      "周进", "范进", "马二先生"
    ]);
  });

  it("搜索框过滤别名", async () => {
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/搜索/), "纯上");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText("马二先生")).toBeInTheDocument();
  });

  it("点击角色触发 onSelect", async () => {
    const onSelect = vi.fn();
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("周进"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it('"下一个待审" 按钮跳到 pendingClaimCount 最多的角色', async () => {
    const onSelect = vi.fn();
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /下一个待审/ }));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("全部已审时按钮 disabled", () => {
    const allDone = items.map((i) => ({ ...i, pendingClaimCount: 0 }));
    render(<PersonaSidebar items={allDone} selectedPersonaId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /全部已审/ })).toBeDisabled();
  });

  it("顶部全书进度展示已审/总", () => {
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/已审 .* \/ 总/)).toBeInTheDocument();
  });

  it("listbox a11y：role=listbox", () => {
    render(<PersonaSidebar items={items} selectedPersonaId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});
