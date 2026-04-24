/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ReviewError from "./error";

describe("ReviewError", () => {
  it("renders a reviewer-facing no-fallback warning for projection failures", () => {
    const reset = vi.fn();

    render(
      <ReviewError
        error={new Error("projection unavailable")}
        reset={reset}
      />
    );

    expect(screen.getByRole("heading", { name: "审核页面出错" })).toBeInTheDocument();
    expect(screen.getByText("projection unavailable")).toBeInTheDocument();
    expect(screen.getByText("系统不会回退到旧版草稿真值，请先重建或校验审核投影后再继续审核。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
