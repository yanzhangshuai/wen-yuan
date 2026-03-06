# 注释规范（含单元测试）

> 目标：保证新增/修改代码都具备可维护、可复现、可排障的注释信息。

---

## 必须遵守

- 新增或修改的导出函数/类/复杂私有方法，必须补充结构化注释。
- 结构化注释至少覆盖：功能、输入约束、输出、异常/失败条件、副作用。
- 复杂分支（权限、事务、重试、边界处理）必须有“为什么这么做”的注释，不仅描述“做了什么”。
- 单元测试必须包含可读场景说明；复杂测试用例必须显式标注 Arrange / Act / Assert。
- 涉及错误码、契约字段、边界行为的断言，注释需说明“业务意义”，而不只是断言语句本身。
- 注释必须与代码同步更新；过期注释视为缺陷。
- 禁止噪声注释：明显一行语句不写无信息量注释。

---

## 生产代码模板

```ts
/**
 * 功能：一句话说明本函数的业务目的。
 * 输入：参数及关键约束（必填、范围、格式、来源）。
 * 输出：返回值结构与关键字段语义。
 * 异常：抛错条件或失败分支（含错误码/错误类型）。
 * 副作用：数据库写入、网络调用、缓存、日志、事件发布等。
 */
```

---

## 单元测试模板

```ts
/**
 * 被测对象：<module/function/class>
 * 测试目标：本文件要覆盖的关键行为。
 * 覆盖范围：success / failure / boundary。
 */
describe("<module>", () => {
  it("returns xxx when yyy", () => {
    // Arrange: 构造输入、mock 依赖、准备前置状态
    // Act: 执行被测逻辑
    // Assert: 校验业务结果、错误码或边界行为
  });
});
```

---

## 代码案例与原因

反例：
```ts
// 测试一下
it("works", () => {
  const result = run(input);
  expect(result).toBeTruthy();
});
```

正例：
```ts
/**
 * 被测对象：parsePagination
 * 测试目标：分页参数归一化行为稳定。
 * 覆盖范围：默认值、非法值、上限截断。
 */
describe("parsePagination", () => {
  it("falls back to defaults on invalid inputs", () => {
    // Arrange
    const searchParams = new URLSearchParams({ page: "-1", page_size: "0" });
    // Act
    const result = parsePagination(searchParams);
    // Assert
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });
});
```

原因：
- 结构化注释可让评审者快速判断覆盖是否充分。
- 对错误码和边界行为写清测试意图，可显著降低回归排障成本。
