/** @vitest-environment jsdom */
import { Suspense } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PersonaDetailPanel } from "./persona-detail-panel";
import type { PersonaDetail } from "@/types/graph";

function buildPersonaDetail(overrides: Partial<PersonaDetail> = {}): PersonaDetail {
  return {
    id           : "persona-1",
    name         : "范进",
    aliases      : [],
    gender       : null,
    hometown     : null,
    nameType     : "NAMED",
    recordSource : "AI",
    confidence   : 0.9,
    status       : "DRAFT",
    profiles     : [],
    timeline     : [],
    relationships: [
      {
        id             : "rel-1",
        bookId         : "book-1",
        bookTitle      : "儒林外史",
        chapterId      : "chapter-1",
        chapterNo      : 1,
        direction      : "outgoing",
        counterpartId  : "persona-2",
        counterpartName: "胡屠户",
        type           : "岳婿",
        weight         : 1,
        eventCount     : 2,
        evidence       : null,
        recordSource   : "AI",
        status         : "DRAFT"
      },
      {
        id             : "rel-2",
        bookId         : "book-1",
        bookTitle      : "儒林外史",
        chapterId      : "chapter-2",
        chapterNo      : 2,
        direction      : "incoming",
        counterpartId  : "persona-2",
        counterpartName: "胡屠户",
        type           : "训斥",
        weight         : 1,
        eventCount     : 0,
        evidence       : null,
        recordSource   : "AI",
        status         : "DRAFT"
      },
      {
        id             : "rel-3",
        bookId         : "book-1",
        bookTitle      : "儒林外史",
        chapterId      : "chapter-3",
        chapterNo      : 3,
        direction      : "outgoing",
        counterpartId  : "persona-3",
        counterpartName: "张乡绅",
        type           : "同乡",
        weight         : 1,
        eventCount     : 0,
        evidence       : null,
        recordSource   : "MANUAL",
        status         : "VERIFIED"
      }
    ],
    ...overrides
  };
}

async function renderPanel(persona: PersonaDetail, onPairClick = vi.fn()) {
  await act(async () => {
    render(
      <Suspense fallback={<div>loading</div>}>
        <PersonaDetailPanel
          personaPromise={Promise.resolve(persona)}
          bookId="book-1"
          onClose={vi.fn()}
          onPairClick={onPairClick}
        />
      </Suspense>
    );
  });
}

describe("PersonaDetailPanel pair list", () => {
  it("aggregates relationships by counterpart and opens a pair", async () => {
    const onPairClick = vi.fn();
    await renderPanel(buildPersonaDetail(), onPairClick);

    const section = await screen.findByRole("region", { name: "与他/她的关系" });
    const huRow = within(section).getByRole("button", { name: /胡屠户/ });
    expect(huRow).toHaveTextContent("2 类");
    expect(huRow).toHaveTextContent("2 事件");

    fireEvent.click(huRow);
    expect(onPairClick).toHaveBeenCalledWith("persona-1", "persona-2");
  });

  it("marks pairs with no events as pending", async () => {
    await renderPanel(buildPersonaDetail());

    const section = await screen.findByRole("region", { name: "与他/她的关系" });
    const zhangRow = within(section).getByRole("button", { name: /张乡绅/ });
    expect(zhangRow).toHaveTextContent("待补充事件");
  });
});
