import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEntityForm } from "../useEntityForm";

// @vitest-environment jsdom

describe("useEntityForm", () => {
  it("初始值和变更", () => {
    const { result } = renderHook(() => useEntityForm({ foo: 1 }));
    expect(result.current.value).toEqual({ foo: 1 });
    act(() => {
      result.current.onChange({ foo: 2 });
    });
    expect(result.current.value).toEqual({ foo: 2 });
    expect(result.current.dirty).toBe(true);
  });

  it("reset 功能", () => {
    const { result } = renderHook(() => useEntityForm({ foo: 1 }));
    act(() => {
      result.current.onChange({ foo: 2 });
      result.current.reset();
    });
    expect(result.current.value).toEqual({ foo: 1 });
    expect(result.current.dirty).toBe(false);
  });
});
