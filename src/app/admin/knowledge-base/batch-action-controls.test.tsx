/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  BatchActionControls,
  GLOBAL_BOOK_TYPE_VALUE
} from "./batch-action-controls";

interface DeferredPromise {
  promise: Promise<void>;
  resolve: () => void;
}

function createDeferredPromise(): DeferredPromise {
  let resolve = () => {};
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("BatchActionControls", () => {
  it("maps the global book type option to null and keeps the dialog open until the async action resolves", async () => {
    // Arrange: 书籍类型切换对话框必须把“通用”映射成 null，且等待业务成功后再关闭。
    const deferred = createDeferredPromise();
    const onChangeBookType = vi.fn().mockReturnValue(deferred.promise);

    render(
      <BatchActionControls
        selectedCount={2}
        bookTypes={[{ id: "book-type-1", name: "历史演义" }]}
        onEnable={vi.fn().mockResolvedValue(undefined)}
        onDisable={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onClear={vi.fn()}
        onChangeBookType={onChangeBookType}
      />
    );

    // Assert: 工具栏应明确展示当前选中数量。
    expect(screen.getByText("已选 2 项")).toBeInTheDocument();

    // Act: 默认选项已经是“通用”，直接提交以覆盖 sentinel -> null 的映射分支。
    fireEvent.click(screen.getByRole("button", { name: "批量设置书籍类型" }));
    fireEvent.click(screen.getByRole("button", { name: "确认设置" }));

    // Assert: 回调拿到 null，且 Promise 未完成前对话框仍保持打开。
    expect(onChangeBookType).toHaveBeenCalledWith(null);
    expect(screen.getByRole("heading", { name: "批量设置书籍类型" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "设置中..." })).toBeDisabled();

    deferred.resolve();

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "批量设置书籍类型" })).not.toBeInTheDocument();
    });
  }, 10_000);

  it("runs the async delete action and closes the confirmation dialog only after success", async () => {
    // Arrange: 批量删除属于不可逆操作，确认弹窗要在成功后才收起。
    const deferred = createDeferredPromise();
    const onDelete = vi.fn().mockReturnValue(deferred.promise);

    render(
      <BatchActionControls
        selectedCount={3}
        bookTypes={[]}
        onEnable={vi.fn().mockResolvedValue(undefined)}
        onDisable={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
        onClear={vi.fn()}
        onChangeBookType={vi.fn().mockResolvedValue(undefined)}
      />
    );

    // Act: 打开批量删除确认框并执行删除。
    fireEvent.click(screen.getByRole("button", { name: "批量删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    // Assert: 删除回调已触发，但 Promise 未结束前确认框仍保留，方便失败时重试。
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "确认批量删除" })).toBeInTheDocument();

    deferred.resolve();

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "确认批量删除" })).not.toBeInTheDocument();
    });
  });

  it("exports a stable sentinel for the global book type option", () => {
    // Assert: Radix Select 不能使用空字符串，通用选项必须走稳定 sentinel。
    expect(GLOBAL_BOOK_TYPE_VALUE).toBe("__GLOBAL_BOOK_TYPE__");
  });
});
