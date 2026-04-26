/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewWorkbenchShell, useReviewWorkbench } from "./review-workbench-shell";
import { type PersonaListItem } from "./persona-list-summary";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter      : () => ({ replace: replaceMock }),
  usePathname    : () => "/admin/review/b1",
  useSearchParams: () => new URLSearchParams()
}));

const items: PersonaListItem[] = [
  {
    personaId          : "p1",
    displayName        : "周进",
    aliases            : [],
    firstChapterNo     : 2,
    totalEventCount    : 10,
    totalRelationCount : 5,
    totalConflictCount : 0,
    pendingClaimCount  : 4,
    personaCandidateIds: ["pc1"]
  }
];

describe("ReviewWorkbenchShell", () => {
  beforeEach(() => replaceMock.mockClear());

  it("渲染 BookSelector / PersonaSidebar / ReviewModeNav 与 children", () => {
    render(
      <ReviewWorkbenchShell
        bookId      ="b1"
        bookTitle   ="儒林外史"
        books       ={[{ id: "b1", title: "儒林外史" }]}
        mode        ="matrix"
        personaItems={items}
      >
        <div data-testid="main">test children</div>
      </ReviewWorkbenchShell>
    );
    expect(screen.getByTestId("main")).toHaveTextContent("test children");
    expect(screen.getByText("周进")).toBeInTheDocument();
  });

  it("点击角色后写 URL 并通过 context 传递 selectedPersonaId", async () => {
    function TestConsumer() {
      const { selectedPersonaId } = useReviewWorkbench();
      return <div data-testid="main">persona={selectedPersonaId ?? "null"}</div>;
    }

    render(
      <ReviewWorkbenchShell
        bookId      ="b1"
        bookTitle   ="儒林外史"
        books       ={[{ id: "b1", title: "儒林外史" }]}
        mode        ="matrix"
        personaItems={items}
      >
        <TestConsumer />
      </ReviewWorkbenchShell>
    );
    expect(screen.getByTestId("main")).toHaveTextContent("persona=null");
    await userEvent.click(screen.getByText("周进"));
    expect(screen.getByTestId("main")).toHaveTextContent("persona=p1");
    expect(replaceMock).toHaveBeenCalled();
    expect(replaceMock.mock.calls[0][0]).toContain("personaId=p1");
  });

  it('键盘 "f" 切换 focusOnly', async () => {
    const user = userEvent.setup();

    function TestConsumer() {
      const { focusOnly } = useReviewWorkbench();
      return <div data-testid="main">focus={String(focusOnly)}</div>;
    }

    render(
      <ReviewWorkbenchShell
        bookId                  ="b1"
        bookTitle               ="儒林外史"
        books                   ={[{ id: "b1", title: "儒林外史" }]}
        mode                    ="matrix"
        personaItems            ={items}
        initialSelectedPersonaId="p1"
      >
        <TestConsumer />
      </ReviewWorkbenchShell>
    );
    expect(screen.getByTestId("main")).toHaveTextContent("focus=false");
    await user.keyboard("f");
    expect(screen.getByTestId("main")).toHaveTextContent("focus=true");
  });

  it('键盘 "Escape" 清除选中', async () => {
    const user = userEvent.setup();

    function TestConsumer() {
      const { selectedPersonaId } = useReviewWorkbench();
      return <div data-testid="main">persona={selectedPersonaId ?? "null"}</div>;
    }

    render(
      <ReviewWorkbenchShell
        bookId                  ="b1"
        bookTitle               ="儒林外史"
        books                   ={[{ id: "b1", title: "儒林外史" }]}
        mode                    ="matrix"
        personaItems            ={items}
        initialSelectedPersonaId="p1"
      >
        <TestConsumer />
      </ReviewWorkbenchShell>
    );
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("main")).toHaveTextContent("persona=null");
  });

  it("context 提供 selectedPersonaId、focusOnly、setFocusOnly", () => {
    function TestConsumer() {
      const ctx = useReviewWorkbench();
      return (
        <div data-testid="main">
          hasSelectedPersonaId={String("selectedPersonaId" in ctx)}
          hasFocusOnly={String("focusOnly" in ctx)}
          hasSetFocusOnly={String("setFocusOnly" in ctx)}
          setFocusOnlyType={typeof ctx.setFocusOnly}
        </div>
      );
    }

    render(
      <ReviewWorkbenchShell
        bookId                  ="b1"
        bookTitle               ="儒林外史"
        books                   ={[{ id: "b1", title: "儒林外史" }]}
        mode                    ="matrix"
        personaItems            ={items}
        initialSelectedPersonaId="p1"
      >
        <TestConsumer />
      </ReviewWorkbenchShell>
    );

    expect(screen.getByTestId("main")).toHaveTextContent("hasSelectedPersonaId=true");
    expect(screen.getByTestId("main")).toHaveTextContent("hasFocusOnly=true");
    expect(screen.getByTestId("main")).toHaveTextContent("hasSetFocusOnly=true");
    expect(screen.getByTestId("main")).toHaveTextContent("setFocusOnlyType=function");
  });

  it("选中角色后显示面包屑，点击清除按钮恢复到 null", async () => {
    function TestConsumer() {
      const { selectedPersonaId } = useReviewWorkbench();
      return <div data-testid="main">persona={selectedPersonaId ?? "null"}</div>;
    }

    render(
      <ReviewWorkbenchShell
        bookId      ="b1"
        bookTitle   ="儒林外史"
        books       ={[{ id: "b1", title: "儒林外史" }]}
        mode        ="matrix"
        personaItems={items}
      >
        <TestConsumer />
      </ReviewWorkbenchShell>
    );
    expect(screen.queryByLabelText("面包屑补充")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("周进"));
    const breadcrumb = screen.getByLabelText("面包屑补充");
    expect(breadcrumb).toBeInTheDocument();
    expect(breadcrumb).toHaveTextContent("审核中心");
    expect(breadcrumb).toHaveTextContent("周进");
    const clearBtn = screen.getByLabelText("清除角色筛选");
    await userEvent.click(clearBtn);
    expect(screen.getByTestId("main")).toHaveTextContent("persona=null");
    expect(screen.queryByLabelText("面包屑补充")).not.toBeInTheDocument();
  });
});
