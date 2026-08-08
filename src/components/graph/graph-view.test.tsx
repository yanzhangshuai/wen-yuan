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

vi.mock("@/components/graph", () => ({
  ForceGraph: (props: ForceGraphProps) => (
    <button type="button" onClick={() => props.onBackgroundClick?.()}>
      background
    </button>
  ),
  GraphToolbar    : () => <div />,
  ChapterTimeline : () => <div />,
  GraphContextMenu: () => <div />,
  GraphPageHeader : () => <div />,
  GraphLegend     : () => <div />
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

describe("GraphView", () => {
  it("renders the force graph canvas with the injected snapshot", () => {
    render(
      <GraphView
        bookId="book-1"
        initialSnapshot={snapshot}
        totalChapters={1}
        bookTitle="儒林外史"
      />
    );

    expect(screen.getByRole("button", { name: "background" })).toBeInTheDocument();
  });

  it("clears temporary interaction state on background click without throwing", () => {
    render(
      <GraphView
        bookId="book-1"
        initialSnapshot={snapshot}
        totalChapters={1}
        bookTitle="儒林外史"
      />
    );

    expect(() => fireEvent.click(screen.getByRole("button", { name: "background" }))).not.toThrow();
  });
});
