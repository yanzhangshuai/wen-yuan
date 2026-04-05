import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * 文件定位：
 * - `vitest.setup.ts` 是 Vitest 全局初始化脚本，由 `vitest.config.ts -> setupFiles` 注入。
 * - 在每个测试文件执行前加载一次，用于统一测试运行时基线。
 *
 * 业务职责：
 * - 注册 `jest-dom` 断言扩展，提升 UI 测试可读性；
 * - 为需要数据库连接串的代码提供测试默认值，避免因环境缺失导致测试直接崩溃；
 * - 在每个测试后清理 React 渲染副作用，防止用例互相污染。
 */
/**
 * 为测试环境提供 DATABASE_URL 兜底值。
 * - 仅当外部未显式注入时才设置（`??=`），避免覆盖 CI/本地自定义配置；
 * - 目的是让依赖配置的模块能被安全导入，不代表测试一定会真实连库。
 */
process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:5432/testdb";

afterEach(() => {
  // 仅在存在 document（如 jsdom 场景）时执行 cleanup。
  // 原因：当前项目默认 test environment 为 node，直接调用 cleanup 可能触发无效 DOM 访问。
  if (typeof document !== "undefined") {
    cleanup();
  }
});
