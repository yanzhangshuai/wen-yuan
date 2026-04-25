/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BookSelector, type BookOption } from "./book-selector";

const books: BookOption[] = [
  { id: "b1", title: "儒林外史" },
  { id: "b2", title: "红楼梦" }
];

describe("BookSelector", () => {
  it("默认显示当前书名", () => {
    render(<BookSelector books={books} currentBookId="b1" basePath="/admin/review" />);
    expect(screen.getByRole("button", { name: /儒林外史/ })).toBeInTheDocument();
  });

  it("打开后展示其它书并支持搜索", async () => {
    render(<BookSelector books={books} currentBookId="b1" basePath="/admin/review" />);
    await userEvent.click(screen.getByRole("button", { name: /儒林外史/ }));
    expect(await screen.findByRole("option", { name: /红楼梦/ })).toBeInTheDocument();

    await userEvent.type(screen.getByRole("combobox"), "红");
    expect(screen.queryByRole("option", { name: /儒林外史/ })).not.toBeInTheDocument();
  });
});
