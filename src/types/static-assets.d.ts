/**
 * 文件定位（TypeScript 声明层）：
 * - 该文件不是运行时代码，而是 TS 编译期的“模块补充声明（Ambient Module Declarations）”。
 * - 在 Next.js 项目中，前端组件常会直接 `import "*.css"` 或字体文件；若没有对应声明，
 *   TypeScript 会把这类导入视为未知模块并在编译阶段报错。
 *
 * 业务职责：
 * - 统一告诉类型系统“这些静态资源导入是合法的”；
 * - 保证页面层/组件层可以稳定引入样式与字体资源，而不需要在每个文件重复定义类型。
 *
 * 维护边界（重要）：
 * - 这里仅影响类型检查，不改变 Next.js 的打包行为；
 * - 如果删除某个声明，相关资源导入会在开发期失败（这是类型层问题，不是运行时资源缺失）。
 */
declare module "*.css";
declare module "*.woff";
declare module "*.woff2";
declare module "*.ttf";
declare module "*.otf";
declare module "*.eot";
