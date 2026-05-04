import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useEntityList } from "../useEntityList";

// @vitest-environment jsdom

describe("useEntityList", () => {
  it("加载数据成功", async () => {
    const fetchList = vi.fn().mockResolvedValue([{ id: 1, name: "foo" }]);
    const { result } = renderHook(() => useEntityList(fetchList));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 1, name: "foo" }]);
    expect(result.current.error).toBeNull();
  });

  it("加载数据失败", async () => {
    const fetchList = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useEntityList(fetchList));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe("fail");
  });
});
