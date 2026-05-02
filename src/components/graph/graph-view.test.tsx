/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GraphView } from "./graph-view";
import type { ForceGraphProps } from "./force-graph";
import type { GraphSnapshot } from "@/types/graph";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" })
}));

vi.mock("sonner", () => ({
  toast: {
    error  : vi.fn(),
    info   : vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}));

vi.mock("@/lib/services/graph", () => ({
  fetchBookGraph   : vi.fn(),
  searchPersonaPath: vi.fn(),
  updateGraphLayout: vi.fn()
}));

vi.mock("@/lib/services/personas", () => ({
  deletePersona     : vi.fn(),
  fetchPersonaDetail: vi.fn()
}));

vi.mock("@/lib/services/books", () => ({
  fetchChapterContent: vi.fn()
}));

vi.mock("@/components/graph", () => ({
  ForceGraph: (props: ForceGraphProps) => (
    <button
      type="button"
      onClick={() => props.onEdgeClick?.("ally|hero", "hero", "ally")}
    >
      open pair from edge
    </button>
  ),
  GraphToolbar      : () => <div />,
  PersonaDetailPanel: () => <div />,
  ChapterTimeline   : () => <div />,
  TextReaderPanel   : () => <div />,
  GraphContextMenu  : () => <div />
}));

vi.mock("@/components/relations/persona-pair-drawer", () => ({
  PersonaPairDrawer: ({ open, aId, bId, role }: { open: boolean; aId: string; bId: string; role: string }) => (
    open ? <div role="dialog">Pair Drawer {aId} {bId} {role}</div> : null
  )
}));

const snapshot: GraphSnapshot = {
  nodes: [
    {
      id          : "hero",
      name        : "范进",
      nameType    : "NAMED",
      entityType  : "PERSON",
      status      : "VERIFIED",
      factionIndex: 0,
      influence   : 1
    },
    {
      id          : "ally",
      name        : "胡屠户",
      nameType    : "NAMED",
      entityType  : "PERSON",
      status      : "VERIFIED",
      factionIndex: 1,
      influence   : 1
    }
  ],
  edges: [
    {
      id        : "rel-1",
      source    : "hero",
      target    : "ally",
      type      : "岳婿",
      weight    : 1,
      eventCount: 1,
      sentiment : "neutral",
      status    : "VERIFIED"
    }
  ]
};

describe("GraphView pair drawer", () => {
  it("opens the pair drawer from an edge click", () => {
    render(
      <GraphView
        bookId="book-1"
        initialSnapshot={snapshot}
        totalChapters={1}
        bookTitle="儒林外史"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "open pair from edge" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Pair Drawer hero ally viewer");
  });
});
