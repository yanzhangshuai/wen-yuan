---
stage: growth
---

# 验证检查清单

> [SYNC-NOTE]
> 角色：事实基准
> 主文档：.trellis/spec/guides/verification-checklist.md
> 镜像文档：.trellis/spec/guides/verification-checklist.zh.md
> 最近同步：2026-03-04
> 同步负责人：system

## 必做的三路径验证

每次变更必须覆盖：

### 1. 成功路径（Success Path）
- **验证内容**：合法输入下的正常流程
- **验证方式**：按典型用户场景执行
- **验证证据**：截图/日志/测试输出，证明结果符合预期

### 2. 失败路径（Failure Path）
- **验证内容**：非法输入或异常情况下的错误处理
- **验证方式**：使用格式错误/缺失/无权限等数据测试
- **验证证据**：稳定错误码 + 可读错误信息

### 3. 边界路径（Boundary/Edge Path）
- **验证内容**：极限值与边界条件
- **验证方式**：空列表、最大值、null/undefined、并发操作等
- **验证证据**：系统可平稳处理且不崩溃

## 验证方式

### 手工验证（最低要求）
```bash
# 1. 启动开发服务器
npm run dev

# 2. 验证成功路径
# - 进入目标功能
# - 执行预期操作
# - 检查结果

# 3. 验证失败路径
# - 触发错误条件
# - 检查错误信息
# - 检查错误码稳定性

# 4. 验证边界路径
# - 使用边界数据测试
# - 检查是否平稳处理
```

### 自动化测试（必做，覆盖业务逻辑变更）
```bash
# 按仓库约定运行单元测试与覆盖率报告
# 示例（按项目实际脚本替换）：
# pnpm test:unit --coverage
```

## 覆盖率基线（成熟团队）

- 原则：测试有效性优先，覆盖率用于门禁，不允许“只追数字”。
- 执行门禁：每次变更都必须运行项目约定的单元测试与 coverage 校验。
- 强制阈值：Statements >= 90%、Branches >= 90%、Functions >= 90%、Lines >= 90%。
- 任一指标未达标时，任务判定未完成，不得交付或合并。
- 高风险模块（安全、计费、核心数据链路）建议 >= 95%。
- 若当前仓库尚无单测框架，必须先补齐最小可用框架与 coverage 报告能力。

## 测试文件组织约定

- 单元测试默认与源码同目录，命名 `*.test.ts` / `*.test.tsx`。
- 跨模块集成测试统一放在独立目录（建议 `tests/integration/**`）。
- 覆盖率统计仅统计源码，不统计测试文件与生成代码。

## 验证证据模板

在 `.trellis/tasks/<task>/verification.md` 中记录：

```markdown
# Verification Evidence

## Success Path
- **Scenario**: [describe]
- **Steps**: [list steps]
- **Expected**: [expected result]
- **Actual**: [actual result]
- **Evidence**: [screenshot/log/test output]

## Failure Path
- **Scenario**: [describe error condition]
- **Steps**: [list steps]
- **Expected**: [error code + message]
- **Actual**: [actual error response]
- **Evidence**: [screenshot/log/test output]

## Boundary Path
- **Scenario**: [describe edge case]
- **Steps**: [list steps]
- **Expected**: [graceful handling]
- **Actual**: [actual behavior]
- **Evidence**: [screenshot/log/test output]
```

## 验证核对

提交前至少确认：

1. ✅ `verification.md` 已创建
2. ✅ Success/Failure/Boundary 三路径都已记录
3. ✅ 每条路径都包含可复现证据
4. ✅ 不包含占位文本（TODO、TBD 等）
5. ✅ 单元测试覆盖关键分支，且覆盖率四项（Statements/Branches/Functions/Lines）全部 >= 90%
6. ✅ 代码与测试注释符合 `comment-guidelines.md` 规范

## 快速验证命令

```bash
# 代码质量基础检查
pnpm lint

# 运行项目约定的单测+覆盖率命令
pnpm test:unit

# 查看当前任务验证文档
cat .trellis/tasks/<task>/verification.md

# 复核注释规范
cat .trellis/spec/guides/comment-guidelines.md
```

## 常见误区

❌ **不要**：
- 跳过失败路径测试
- 使用泛化错误信息
- 忽略边界场景
- 提供伪造证据
- 只堆覆盖率数字，不验证关键业务断言

✅ **要做**：
- 覆盖三条路径
- 使用稳定错误码
- 记录真实结果
- 提供真实证据
- 先保证测试有效性，再保证覆盖率达标

## 为什么必须三路径

- 只测成功路径会遗漏真实用户最常遇到的失败与边界输入。
- 失败路径和边界路径是系统稳定性的主要风险来源。
- 三路径验证可显著减少“上线后才暴露”的低级回归。

代码示例：
```ts
// 反例：只断言 happy path
expect(response.success).toBe(true);

// 正例：success + failure + boundary 都覆盖
expect(success.code).toBe("ANALYZE_CHAPTER_OK");
expect(failure.code).toBe("MISSING_CHAPTER_ID");
expect(boundary.code).toBe("COMMON_BAD_REQUEST");
```
