import type { NextConfig } from "next";

/**
 * 文件定位（Next.js 框架语义）：
 * - `next.config.ts` 是 Next.js 的全局构建与运行配置入口。
 * - Next.js 在 `next dev` / `next build` / `next start` 阶段读取该文件，
 *   用于确定编译行为、运行时选项、HTTP 头策略等。
 *
 * 业务职责：
 * - 为整站统一追加安全响应头，降低常见前端安全风险；
 * - 声明服务端依赖包外置策略，确保 Node 侧可正确加载特定库。
 *
 * 影响范围：
 * - 这是“全局配置”，会影响所有路由（包括 `app/` 下页面和 `route.ts` API）。
 * - 修改时需评估全站影响，属于高风险配置点。
 */
const securityHeaders = [
  // 禁止页面被 <iframe> 嵌入，防御 clickjacking（点击劫持）。
  { key: "X-Frame-Options", value: "DENY" },
  // 禁止浏览器 MIME 嗅探，避免内容类型被错误推断导致执行风险。
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 关闭 DNS 预取，减少在隐私与安全场景中的额外外联暴露。
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // 控制 Referer 透出策略：跨域仅发送源信息，平衡统计能力与隐私。
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // 主动关闭不需要的浏览器能力（相机、麦克风、定位、支付）。
    // 这是安全基线策略，不是 Next.js 技术限制。
    key  : "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()"
  }
];

const nextConfig: NextConfig = {
  // React 严格模式：开发期触发额外检查，帮助发现副作用与不安全生命周期使用。
  // 注意：仅开发阶段更“严格”，不会改变生产功能语义。
  reactStrictMode       : true,
  // 将 `ali-oss` 作为服务端外置包处理，避免被错误打进客户端或产生打包兼容问题。
  // 业务原因：该库依赖 Node 环境，更适合在服务端按需加载。
  serverExternalPackages: ["ali-oss"],
  /**
   * Next.js headers 配置钩子：
   * - 框架会在启动时读取并应用此映射；
   * - `source: "/:path*"` 表示匹配所有路径；
   * - 返回的 headers 会附加到匹配响应上（页面与 API 都会受影响）。
   */
  headers() {
    return [
      {
        source : "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
