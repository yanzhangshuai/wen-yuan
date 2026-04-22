/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RelationWarningBanner } from "./relation-warning-banner";

/**
 * 文件定位（T14 Task 6 warning banner 单测）：
 * - 锁定关系编辑详情中的冲突提示只做 presentational warning；
 * - 方向冲突与区间冲突可独立出现，也可同时出现，而不会吞掉旁边编辑控件。
 */
describe("RelationWarningBanner", () => {
  it("shows the direction-conflict warning only when requested", () => {
    render(
      <RelationWarningBanner
        warnings={{
          directionConflict: true,
          intervalConflict : false
        }}
      />
    );

    expect(screen.getByText("当前人物关系对存在方向冲突，请逐条核对关系方向。")).toBeInTheDocument();
    expect(screen.queryByText("当前人物关系对存在生效区间冲突，请核对章节区间。")).not.toBeInTheDocument();
  });

  it("shows the interval-conflict warning only when requested", () => {
    render(
      <RelationWarningBanner
        warnings={{
          directionConflict: false,
          intervalConflict : true
        }}
      />
    );

    expect(screen.getByText("当前人物关系对存在生效区间冲突，请核对章节区间。")).toBeInTheDocument();
    expect(screen.queryByText("当前人物关系对存在方向冲突，请逐条核对关系方向。")).not.toBeInTheDocument();
  });

  it("can show both warnings without blocking adjacent sheet controls", () => {
    render(
      <div>
        <RelationWarningBanner
          warnings={{
            directionConflict: true,
            intervalConflict : true
          }}
        />
        <button type="button">保存更改</button>
      </div>
    );

    expect(screen.getByText("当前人物关系对存在方向冲突，请逐条核对关系方向。")).toBeInTheDocument();
    expect(screen.getByText("当前人物关系对存在生效区间冲突，请核对章节区间。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存更改" })).toBeEnabled();
  });
});
