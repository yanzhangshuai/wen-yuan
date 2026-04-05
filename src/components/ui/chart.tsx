/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
// recharts v3 type incompatibility with shadcn chart component
"use client";

/**
 * =============================================================================
 * 文件定位（设计系统 - 图表容器与图例/提示层）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/ui/chart.tsx`
 *
 * 在项目中的职责：
 * - 统一 Recharts 在项目中的主题色注入、Tooltip/Legend 结构与可复用配置协议；
 * - 让业务图表只关注“数据与序列定义”，而非重复处理样式、主题切换、文案映射。
 *
 * 为什么是 Client Component：
 * - 图表渲染、悬浮提示、窗口尺寸响应都依赖浏览器运行时；
 * - 因此必须在客户端执行，服务端仅负责输出容器初始结构。
 *
 * 维护提示：
 * - 本文件存在针对 recharts v3 的类型兼容折中（eslint 规则局部放宽）；
 * - 若升级库版本，请优先回收这部分兼容代码，再评估是否恢复更严格类型约束。
 * =============================================================================
 */

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
  /**
   * key：序列标识（通常与 dataKey 对齐）。
   * value：该序列在图例与 tooltip 中的展示策略。
   */
  [k in string]: {
    /** 该序列在 UI 中展示的文案标签。 */
    label?: React.ReactNode
    /** 可选图标组件，用于图例与 tooltip 前缀。 */
    icon? : React.ComponentType
  } & (
    // 两种互斥配置：
    // 1) 直接给固定 color；
    // 2) 按 light/dark 主题分别给色值。
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
};

type ChartContextProps = {
  config: ChartConfig
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    // 防御式错误：防止在容器外调用，避免 config 缺失导致 tooltip/legend 渲染异常。
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config  : ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"]
}) {
  const uniqueId = React.useId();
  // useId 在并发渲染下可保证稳定性；替换冒号是为了拼接可用 CSS 选择器。
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  // 仅提取声明了颜色策略的序列，避免生成无意义 CSS 变量。
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme || config.color
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      // 通过 CSS 变量给每个图表实例注入序列色值，避免业务组件硬编码颜色。
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join("\n")}
}
`
          )
          .join("\n")
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

// Recharts v3 将 tooltip 渲染器入参与 Tooltip 组件 props 拆分，
// 这里显式使用 TooltipContentProps，避免 payload/active 等字段类型缺失。
type ChartTooltipContentProps = React.ComponentProps<"div"> &
  RechartsPrimitive.TooltipContentProps & {
    /** 隐藏标题行（仅保留明细项）。 */
    hideLabel?    : boolean
    /** 隐藏颜色指示器。 */
    hideIndicator?: boolean
    /** 指示器形态：点、线、虚线。 */
    indicator?    : "line" | "dot" | "dashed"
    /** 指定从 payload 中读取系列名的字段。 */
    nameKey?      : string
    /** 指定从 payload 中读取标签字段。 */
    labelKey?     : string
  };

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey
}: ChartTooltipContentProps) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    // tooltip 标题在以下场景不展示：
    // 1) 调用方显式隐藏；
    // 2) 当前无 payload（鼠标未悬停到有效点）。
    if (hideLabel || !payload?.length) {
      return null;
    }

    const [item] = payload;
    const key = normalizePayloadKey(labelKey ?? item?.dataKey ?? item?.name);
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const value =
      !labelKey && typeof label === "string"
        ? config[label]?.label || label
        : itemConfig?.label;

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      );
    }

    if (!value) {
      return null;
    }

    return <div className={cn("font-medium", labelClassName)}>{value}</div>;
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey
  ]);

  if (!active || !payload?.length) {
    // inactive 直接不渲染，避免 tooltip 占位影响布局与事件命中。
    return null;
  }

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div
      className={cn(
        "border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = normalizePayloadKey(nameKey ?? item.name ?? item.dataKey);
          const itemConfig = getPayloadConfigFromPayload(config, item, key);
          const indicatorColor = color || item.payload.fill || item.color;
          const rowKey = normalizePayloadKey(item.dataKey ?? item.name, index);

          return (
            <div
              key={rowKey}
              className={cn(
                "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
                indicator === "dot" && "items-center"
              )}
            >
              {formatter && item?.value !== undefined && item.name ? (
                formatter(item.value, item.name, item, index, payload)
              ) : (
                <>
                  {itemConfig?.icon ? (
                    <itemConfig.icon />
                  ) : (
                    !hideIndicator && (
                      <div
                        className={cn(
                          "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                          {
                            "h-2.5 w-2.5": indicator === "dot",
                            "w-1"        : indicator === "line",
                            "w-0 border-[1.5px] border-dashed bg-transparent":
                              indicator === "dashed",
                            "my-0.5": nestLabel && indicator === "dashed"
                          }
                        )}
                        style={
                          {
                            "--color-bg"    : indicatorColor,
                            "--color-border": indicatorColor
                          } as React.CSSProperties
                        }
                      />
                    )
                  )}
                  <div
                    className={cn(
                      "flex flex-1 justify-between leading-none",
                      nestLabel ? "items-end" : "items-center"
                    )}
                  >
                    <div className="grid gap-1.5">
                      {nestLabel ? tooltipLabel : null}
                      <span className="text-muted-foreground">
                        {itemConfig?.label || item.name}
                      </span>
                    </div>
                    {item.value && (
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {item.value.toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey
}: React.ComponentProps<"div"> &
  Pick<
    RechartsPrimitive.DefaultLegendContentProps,
    "payload" | "verticalAlign"
  > & {
    hideIcon?: boolean
    nameKey? : string
  }) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {payload.map((item) => {
        const key = normalizePayloadKey(nameKey ?? item.dataKey);
        const itemConfig = getPayloadConfigFromPayload(config, item, key);

        return (
          <div
            key={item.value}
            className={
              "[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"
            }
          >
            {itemConfig?.icon && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor: item.color
                }}
              />
            )}
            {itemConfig?.label}
          </div>
        );
      })}
    </div>
  );
}

function normalizePayloadKey(
  value: unknown,
  fallback: string | number = "value"
): string {
  // payload 字段可能是 number/string/undefined，统一归一化为字符串 key。
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return String(fallback);
}

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  // payload 来源可能是不同图表组件，字段结构不一致，需要分支兼容。
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined;

  let configLabelKey: string = key;

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string;
  }

  return configLabelKey in config
    ? config[configLabelKey]
    : config[key];
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle
};
