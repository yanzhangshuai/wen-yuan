---
stage: mvp
---

# 注释模板

> [SYNC-NOTE]
> 角色：事实基准（供 agents 使用）
> 主文档：.trellis/spec/backend/comment-template.md
> 镜像文档：.trellis/spec/backend/comment-template.zh.md
> 最近同步：2026-03-03
> 同步负责人：codex


## 适用范围

对新增或修改的后端导出声明、复杂私有方法与单元测试文件，使用结构化注释模板。

## 生产代码模板

```ts
/**
 * 功能：一句话说明做什么。
 * 输入：参数名与关键约束。
 * 输出：返回值与结构。
 * 异常：会抛出的错误或失败条件。
 * 副作用：数据库写入、网络请求、日志输出等。
 */
```

## 单元测试模板

```ts
/**
 * 被测对象：模块/函数/类。
 * 测试目标：本测试文件要证明的行为。
 * 覆盖范围：success / failure / boundary。
 */
describe("<module>", () => {
  it("should xxx when yyy", () => {
    // Arrange: 准备输入、mock、前置状态
    // Act: 执行被测逻辑
    // Assert: 校验业务结果、错误码、边界行为
  });
});
```

## 现有参考

- `src/server/http/api-response.ts`
- `src/server/actions/analysis.ts`
- `src/server/modules/analysis/services/ChapterAnalysisService.ts`
- `src/server/modules/auth/rbac.test.ts`
- `src/server/http/route-utils.test.ts`

## 规则

- 字段顺序必须固定：功能 -> 输入 -> 输出 -> 异常 -> 副作用。
- 如果不存在异常或副作用，必须显式写 `无`。
- 单元测试必须写清场景与目标；复杂测试必须显式标注 Arrange/Act/Assert。
- 涉及错误码或契约字段断言时，注释需说明断言的业务意义。
- 对明显的一行逻辑避免添加噪声注释。
- 对高复杂度逻辑，注释必须覆盖业务意图、关键约束、错误/边界行为与副作用，
  且信息量应足够让其他工程师快速复现与排障。
- 注释与实现不一致时，按缺陷处理并优先修正。

---

## 代码案例与原因

反例：
```ts
// 处理章节
export async function runChapterAnalysisAction() {
  // ...
}
```

正例：
```ts
/**
 * 功能：用于 useActionState 的章节解析 Action。
 * 输入：prevState、formData（需包含 chapterId）。
 * 输出：AnalysisActionState。
 * 异常：无（统一转为失败状态）。
 * 副作用：触发 startChapterAnalysis。
 */
export async function runChapterAnalysisAction() {
  // ...
}
```

原因：
- 固定模板能降低知识流失，后续维护者可快速理解行为与风险点。
- 对复杂流程写清副作用与异常策略，可减少“改动后误伤”。
