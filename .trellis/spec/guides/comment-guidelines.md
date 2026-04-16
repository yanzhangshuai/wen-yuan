# 注释规范（含单元测试）

> 目标：让注释提供代码本身无法传达的信息——**为什么**，而不是**做了什么**。
>
> 模式说明：
> - 默认开发任务使用本规范（强调“必要且高价值注释”）。
> - 若任务是“Next.js 全量注释补全/注释收尾巡检”，切换到
>   [`../frontend/nextjs-detailed-commenting.md`](../frontend/nextjs-detailed-commenting.md)，
>   该规范优先级更高，要求文件级、类型级、分支级全覆盖。

---

## 核心原则

**只在真正需要的地方写注释。** 代码已经说清楚的事不要重复描述。

**但对新增/修改代码的交付要求是硬性门槛：** 导出函数、复杂私有方法、关键业务分支与单元测试，必须按本规范补齐注释；未补齐视为任务未完成，不得交付。

注释要写：

- **复杂业务逻辑**：非显而易见的分支、算法、权衡
- **"为什么这么做"**：背后的约束或决策，而不是解释读者能看懂的逻辑
- **已知陷阱**：绕过某个 bug、特殊兼容处理、外部 API 限制

注释不要写：

- interface 字段和简单属性（`id: string` 不需要注释"唯一标识符"）
- 显而易见的单行函数（`return items.length === 0` 不需要注释"返回是否为空"）
- 参数名已经说清楚的内容（`chunkIndex: number` 不需要注释"分段索引"）

---

## 生产代码：何时写，写什么

**必须注释**的场景：

```ts
// 1. 非显而易见的业务规则（为什么，不是做了什么）
// ironyNote 过滤泛化标签（"批判社会"之类），避免无信息量内容污染数据库
private sanitizeIronyNote(note?: string): string | undefined {
  if (!note) return undefined;
  const clean = note.replace(/\s+/g, " ").trim();
  return clean.length < 5 ? undefined : clean.slice(0, 300);
}

// 2. 关键约束（函数签名无法表达时）
/**
 * 执行章节分析主流程并写入结构化文学数据。
 * chapterId 不存在时直接抛错，不静默降级（避免写入空数据）。
 */
async analyzeChapter(chapterId: string): Promise<ChapterAnalysisResult>

// 3. 为什么不用更简单的方案
// Set 去重而非 filter，避免大章节场景下的 O(n²) 性能问题
const mentionKeys = new Set<string>();
```

**不需要注释**的场景（当前代码库里的过度注释示例）：

```ts
// 禁止：重复代码已表达的内容
/**
 * 功能：合并多个分段分析结果。
 * 输入：results - 各分段的 ChapterAnalysisResponse。
 * 输出：单一 ChapterAnalysisResponse。
 * 异常：无。
 * 副作用：无。
 */
private mergeChunkResults(results: ChapterAnalysisResponse[]): ChapterAnalysisResponse

// 正确：函数名 + 类型签名已足够，删掉注释
private mergeChunkResults(results: ChapterAnalysisResponse[]): ChapterAnalysisResponse
```

---

## 单元测试：必须写场景说明

测试名要清楚说明**在什么条件下期望什么行为**。

```ts
// 禁止
it("works", () => { ... });
it("test 1", () => { ... });

// 正确：条件 + 预期结果
describe("parsePagination", () => {
  it("falls back to page=1 when page param is negative", () => {
    // Arrange
    const params = new URLSearchParams({ page: "-1" });
    // Act
    const result = parsePagination(params);
    // Assert
    expect(result.page).toBe(1);
  });
});
```

复杂测试用例标注 `// Arrange / Act / Assert`，简单的不必强制。

---

## 禁止噪声注释

```ts
// 禁止：比代码还啰嗦
i++; // i 自增

// 禁止：被注释掉的旧代码
// const old = char.name.toLowerCase();

// 禁止：空泛的 TODO
// TODO: fix this
```

---

## 交付门槛

- 任何新增或修改的生产代码、测试代码，在交付前都必须完成一次“注释自检”。
- 后端导出声明、复杂私有方法、前端复杂交互逻辑、单元测试文件，必须有足够注释支撑维护与排障。
- 如果实现已改动但注释仍停留在旧行为，按缺陷处理，优先修正文档与代码的一致性。
- “功能已写完但注释还没补”不算完成状态。
