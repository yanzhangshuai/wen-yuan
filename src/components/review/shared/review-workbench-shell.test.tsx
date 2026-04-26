/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewWorkbenchShell } from "./review-workbench-shell";
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
        renderMain  ={({ selectedPersonaId, focusOnly }) => (
          <div data-testid="main">
            persona={selectedPersonaId ?? "null"} focus={String(focusOnly)}
          </div>
        )}
      />
    );
    expect(screen.getByTestId("main")).toHaveTextContent("persona=null focus=false");
    expect(screen.getByText("周进")).toBeInTheDocument();
  });

  it("点击角色后写 URL 并把 selectedPersonaId 传给 main", async () => {
    render(
      <ReviewWorkbenchShell
        bookId      ="b1"
        bookTitle   ="儒林外史"
        books       ={[{ id: "b1", title: "儒林外史" }]}
        mode        ="matrix"
        personaItems={items}
        renderMain  ={({ selectedPersonaId }) => (
          <div data-testid="main">persona={selectedPersonaId ?? "null"}</div>
        )}
      />
    );
    await userEvent.click(screen.getByText("周进"));
    expect(screen.getByTestId("main")).toHaveTextContent("persona=p1");
    expect(replaceMock).toHaveBeenCalled();
    expect(replaceMock.mock.calls[0][0]).toContain("personaId=p1");
  });

  it('键盘 "f" 切换 focusOnly', async () => {
    const user = userEvent.setup();
    render(
      <ReviewWorkbenchShell
        bookId                  ="b1"
        bookTitle               ="儒林外史"
        books                   ={[{ id: "b1", title: "儒林外史" }]}
        mode                    ="matrix"
        personaItems            ={items}
        initialSelectedPersonaId="p1"
        renderMain              ={({ focusOnly }) => <div data-testid="main">focus={String(focusOnly)}</div>}
      />
    );
    expect(screen.getByTestId("main")).toHaveTextContent("focus=false");
    await user.keyboard("f");
    expect(screen.getByTestId("main")).toHaveTextContent("focus=true");
  });

  it('键盘 "Escape" 清除选中', async () => {
    const user = userEvent.setup();
    render(
      <ReviewWorkbenchShell
        bookId                  ="b1"
        bookTitle               ="儒林外史"
        books                   ={[{ id: "b1", title: "儒林外史" }]}
        mode                    ="matrix"
        personaItems            ={items}
        initialSelectedPersonaId="p1"
        renderMain              ={({ selectedPersonaId }) => (
          <div data-testid="main">persona={selectedPersonaId ?? "null"}</div>
        )}
      />
    );
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("main")).toHaveTextContent("persona=null");
  });

  it("renderMain 接收 onFocusOnlyChange 回调", () => {
    const renderMain = vi.fn().mockReturnValue(<div data-testid="main">test</div>);
    
    render(
      <ReviewWorkbenchShell
        bookId                  ="b1"
        bookTitle               ="儒林外史"
        books                   ={[{ id: "b1", title: "儒林外史" }]}
        mode                    ="matrix"
        personaItems            ={items}
        initialSelectedPersonaId="p1"
        renderMain              ={renderMain}
      />
    );

    expect(renderMain).toHaveBeenCalled();
    const callArgs = renderMain.mock.calls[0][0];
    expect(callArgs).toHaveProperty("selectedPersonaId");
    expect(callArgs).toHaveProperty("focusOnly");
    expect(callArgs).toHaveProperty("onFocusOnlyChange");
    expect(typeof callArgs.onFocusOnlyChange).toBe("function");
  });

  it("选中角色后显示面包屑，点击清除按钮恢复到 null", async () => {
    render(
      <ReviewWorkbenchShell
        bookId      ="b1"
        bookTitle   ="儒林外史"
        books       ={[{ id: "b1", title: "儒林外史" }]}
        mode        ="matrix"
        personaItems={items}
        renderMain  ={({ selectedPersonaId }) => (
          <div data-testid="main">persona={selectedPersonaId ?? "null"}</div>
        )}
      />
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
