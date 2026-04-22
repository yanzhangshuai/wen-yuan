import { describe, expect, it } from "vitest";

import { calculateMatrixWindow } from "./matrix-windowing";

/**
 * 文件定位（矩阵窗口化纯函数单测）：
 * - 锁定人物 x 章节大矩阵的窗口切片规则，避免后续 UI 层把滚动、overscan、选中保活逻辑写散。
 * - 这些断言优先描述 reviewer 可感知的行为，而不是具体 DOM 实现细节。
 */
describe("calculateMatrixWindow", () => {
  it("returns the full range when the matrix fits inside the viewport", () => {
    expect(
      calculateMatrixWindow({
        totalRows      : 3,
        totalColumns   : 2,
        viewportHeight : 480,
        viewportWidth  : 480,
        scrollTop      : 0,
        scrollLeft     : 0,
        rowHeight      : 80,
        columnWidth    : 160,
        overscanRows   : 1,
        overscanColumns: 1
      })
    ).toMatchObject({
      rowStart           : 0,
      rowEnd             : 3,
      columnStart        : 0,
      columnEnd          : 2,
      pinnedRowIndexes   : [],
      pinnedColumnIndexes: []
    });
  });

  it("calculates the visible row and column window from scroll offsets", () => {
    expect(
      calculateMatrixWindow({
        totalRows      : 120,
        totalColumns   : 60,
        viewportHeight : 180,
        viewportWidth  : 400,
        scrollTop      : 240,
        scrollLeft     : 300,
        rowHeight      : 60,
        columnWidth    : 100,
        overscanRows   : 0,
        overscanColumns: 0
      })
    ).toMatchObject({
      rowStart   : 4,
      rowEnd     : 7,
      columnStart: 3,
      columnEnd  : 7
    });
  });

  it("extends the computed window by overscan rows and columns", () => {
    expect(
      calculateMatrixWindow({
        totalRows      : 120,
        totalColumns   : 60,
        viewportHeight : 180,
        viewportWidth  : 400,
        scrollTop      : 240,
        scrollLeft     : 300,
        rowHeight      : 60,
        columnWidth    : 100,
        overscanRows   : 2,
        overscanColumns: 1
      })
    ).toMatchObject({
      rowStart   : 2,
      rowEnd     : 9,
      columnStart: 2,
      columnEnd  : 8
    });
  });

  it("keeps the selected row and column addressable even when they are outside the current window", () => {
    expect(
      calculateMatrixWindow({
        totalRows          : 120,
        totalColumns       : 60,
        viewportHeight     : 180,
        viewportWidth      : 400,
        scrollTop          : 0,
        scrollLeft         : 0,
        rowHeight          : 60,
        columnWidth        : 100,
        overscanRows       : 0,
        overscanColumns    : 0,
        selectedRowIndex   : 22,
        selectedColumnIndex: 15
      })
    ).toMatchObject({
      rowStart           : 0,
      rowEnd             : 3,
      columnStart        : 0,
      columnEnd          : 4,
      pinnedRowIndexes   : [22],
      pinnedColumnIndexes: [15]
    });
  });
});
