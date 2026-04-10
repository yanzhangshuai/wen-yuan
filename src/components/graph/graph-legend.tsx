"use client";

/**
 * =============================================================================
 * 文件定位（图谱关系类型图例）
 * -----------------------------------------------------------------------------
 * 组件类型：Client Component（声明了 `"use client"`）。
 *
 * 在 Next.js 应用中的职责：
 * - 展示当前图谱中所有出现的关系类型及其对应颜色；
 * - 以固定位置浮层形式展示在图谱画布左下角，供用户识别边颜色含义；
 * - `pointer-events-none` 确保图例不阻挡画布的鼠标事件。
 *
 * 设计参考：
 * - 参照 sheji 项目 `app/graph/[bookId]/page.tsx` 底部左侧 legend 设计；
 * - 边颜色盘由父组件（GraphView）按主题动态传入，保证多主题适配。
 *
 * 上下游关系：
 * - 上游：`GraphView`（提供 `edgeTypeColorMap` 映射与节点状态图例所需数据）；
 * - 无业务下游；用户可见但不可操作。
 * =============================================================================
 */

export interface GraphLegendProps {
  /**
   * 关系类型到颜色的映射表。
   * key = 边的 `type` 字段（如"父子"、"君臣"）
   * value = 对应的十六进制/OKLCH 颜色字符串
   */
  edgeTypeColorMap: ReadonlyMap<string, string>;
}

/**
 * 图谱图例组件。
 * 显示当前图谱中出现的关系类型与对应颜色，放置于画布左下角。
 * 若当前快照中没有关系类型数据则不渲染（避免空图例占位）。
 */
export function GraphLegend({ edgeTypeColorMap }: GraphLegendProps) {
  // 没有任何关系类型时不展示图例，避免空面板占位影响布局。
  if (edgeTypeColorMap.size === 0) return null;

  return (
    <div
      className="pointer-events-none absolute bottom-16 left-4 z-10 rounded-xl p-3 text-xs"
      style={{
        background    : "color-mix(in oklch, var(--card) 80%, transparent)",
        backdropFilter: "blur(12px)",
        border        : "1px solid color-mix(in oklch, var(--border) 50%, transparent)",
        minWidth      : 132,
        // 限制最大高度避免极端情况下溢出屏幕
        maxHeight     : "40vh",
        overflowY     : "auto"
      }}
    >
      {/* 图例标题 */}
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        关系类型
      </div>

      {/* 关系类型色条列表 */}
      <div className="space-y-1.5">
        {[...edgeTypeColorMap.entries()].map(([type, color]) => (
          <div key={type} className="flex items-center gap-2">
            {/* 色条：宽 24px、高 2px，圆角，体现「边/线」的视觉隐喻 */}
            <div
              className="rounded-full"
              style={{ width: 24, height: 2, background: color, flexShrink: 0 }}
            />
            <span className="text-muted-foreground truncate max-w-[100px]">{type}</span>
          </div>
        ))}
      </div>

      {/* 节点状态图例：已校对 / 待校对 */}
      <div
        className="mt-3 space-y-1.5 pt-2"
        style={{ borderTop: "1px solid color-mix(in oklch, var(--border) 40%, transparent)" }}
      >
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          节点状态
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{
              background: "var(--color-graph-verified-glow)",
              boxShadow : "0 0 4px var(--color-graph-verified-glow)"
            }}
          />
          <span className="text-muted-foreground">已校对</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full border border-dashed border-muted-foreground/50"
          />
          <span className="text-muted-foreground">待校对</span>
        </div>
      </div>
    </div>
  );
}
