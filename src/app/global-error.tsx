"use client";

/**
 * 文件定位（Next.js App Router 约定文件）：
 * - 当前文件名为 `global-error.tsx`，位于 `app/` 根目录时会被 Next.js 识别为“全局兜底错误边界”。
 * - 当应用根布局、页面树或更深层级未被局部 `error.tsx` 吸收的异常冒泡到顶层时，框架会渲染此组件。
 *
 * 核心职责：
 * - 在“应用级故障”场景下提供可见、可恢复的兜底页面，避免用户只看到白屏。
 * - 通过 `reset` 触发重新渲染尝试，帮助用户从临时故障中恢复。
 *
 * 运行环境与框架语义：
 * - 必须声明 `"use client"`：Next.js 的错误边界恢复动作依赖浏览器事件（点击重试），因此只能是 Client Component。
 * - 该文件不会改变业务路由语义；它只在异常链路被动接管渲染。
 *
 * 上下游关系：
 * - 上游输入：Next.js 注入 `error`（异常对象）与 `reset`（重试函数）。
 * - 下游输出：向最终用户展示统一错误说明与恢复入口。
 *
 * 维护注意：
 * - 这里是“最后一道兜底”，不要耦合复杂业务请求，避免在错误页里再次触发新错误。
 * - 当前展示 `error.message` 便于问题定位，但在生产环境可能泄露内部细节；这是风险提示，不是技术限制。
 */
interface GlobalErrorProps {
  /**
   * 业务语义：
   * - 当前渲染失败对应的异常对象，由 Next.js 在错误边界阶段注入。
   * - `digest` 是 Next.js 可能附带的错误指纹，可用于日志聚合排查（不保证一定存在）。
   */
  error: Error & { digest?: string };
  /**
   * 业务语义：
   * - 触发“重试本次渲染流程”的回调。
   * - 用户点击后，框架会重新执行当前路由段相关渲染逻辑（含数据读取链路）。
   */
  reset: () => void;
}

export default function GlobalError({
  error,
  reset
}: GlobalErrorProps) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        {/* 设计意图：使用全屏居中容器，确保无论错误发生在哪个页面，用户都能第一时间看到明确反馈。 */}
        <div style={{
          minHeight      : "100vh",
          display        : "flex",
          flexDirection  : "column",
          alignItems     : "center",
          justifyContent : "center",
          padding        : "2rem",
          backgroundColor: "#F5F0E8",
          color          : "#1A1206"
        }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            应用出错了
          </h1>
          <p style={{ fontSize: "1rem", color: "#8B7355", marginBottom: "1.5rem", textAlign: "center" }}>
            {/*
             * 分支原因：
             * - 优先展示 `error.message`：帮助用户/测试人员快速识别具体失败信息。
             * - 回退到固定文案：防御 `message` 为空、不可读或异常对象不规范的情况，保证 UI 始终有可理解反馈。
             */}
            {error.message || "发生了一个意外错误，请刷新页面重试。"}
          </p>
          <button
            /*
             * 交互语义：
             * - `reset` 是 Next.js 提供的标准恢复机制，而非自定义刷新逻辑。
             * - 这样设计可尽量保留用户当前路由上下文，避免强制整站跳转带来的体验割裂。
             */
            onClick={reset}
            style={{
              padding        : "0.75rem 1.5rem",
              backgroundColor: "#C0392B",
              color          : "#fff",
              borderRadius   : "6px",
              border         : "none",
              fontSize       : "0.875rem",
              fontWeight     : 600,
              cursor         : "pointer"
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
