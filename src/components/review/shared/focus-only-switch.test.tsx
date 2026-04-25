/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FocusOnlySwitch } from "./focus-only-switch";

describe("FocusOnlySwitch", () => {
  it("disabled 时不触发回调", async () => {
    const onChange = vi.fn();
    render(<FocusOnlySwitch checked={false} onCheckedChange={onChange} disabled />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("点击切换并触发 onCheckedChange", async () => {
    const onChange = vi.fn();
    render(<FocusOnlySwitch checked={false} onCheckedChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
