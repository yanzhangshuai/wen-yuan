import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * 文件定位：
 * - `vitest.config.ts` 是单元测试框架 Vitest 的全局配置入口。
 * - 在执行 `vitest` / `pnpm test` / 覆盖率统计时被读取。
 *
 * 项目职责：
 * - 对齐测试环境与业务代码路径别名（`@ -> src`）；
 * - 约束测试收集范围与覆盖率门槛，保障质量基线；
 * - 排除自动生成与基础设施目录，避免覆盖率噪声干扰业务指标。
 */
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // 与 Next.js / TS 配置保持一致，确保测试中 `@/...` 导入路径可解析。
      "@": resolve(projectRoot, "src")
    }
  },
  test: {
    // 使用 Node 环境运行测试：
    // - 该项目大量逻辑位于服务端模块（数据库、文件系统、服务层）；
    // - 对纯前端组件测试，仍可在具体用例中按需引入 jsdom 能力。
    environment: "node",
    // 每个测试文件执行前先加载统一初始化脚本（mock、全局变量、清理策略等）。
    setupFiles : ["./vitest.setup.ts"],
    // 仅收集项目内约定命名的测试文件，避免误跑业务源码。
    // T21 在 scripts/review-regression 下为 CLI 保留薄包装测试，因此这里显式纳入该目录。
    include    : [
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/review-regression/**/*.{test,spec}.{ts,tsx}"
    ],
    coverage: {
      // 使用 V8 原生覆盖率引擎，性能与稳定性更适配 Node 场景。
      provider        : "v8",
      // 同时输出终端、HTML、LCOV，分别服务本地查看与 CI 平台集成。
      reporter        : ["text", "html", "lcov"],
      reportsDirectory: "coverage/unit",
      exclude         : [
        // 自动生成代码：改动来源非人工，不纳入人工质量考核。
        "src/generated/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/node_modules/**",
        "**/.next/**",
        // Prisma 目录偏基础设施脚本，通常不作为单元覆盖率主目标。
        "**/prisma/**",
        "**/*.test.*",
        "**/*.spec.*",
        "vitest.setup.ts",
        // provider 多为第三方适配层，覆盖率收益低且易受外部依赖噪声影响。
        // 风险提示：若后续该层承载更多业务逻辑，建议移除此排除并补测试。
        "src/server/providers/**"
      ],
      thresholds: {
        // 覆盖率阈值是团队质量门槛，属于工程规则，不是技术限制。
        lines     : 90,
        branches  : 85,
        functions : 90,
        statements: 90
      }
    }
  }
});
