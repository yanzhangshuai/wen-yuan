# Phase 4: 导入 UI 架构选择器 + API + DB

## Goal

让用户在导入书籍 Step 3 选择解析架构（顺序 / 两遍式），API 与 DB 支持存储与读取此选择。

## 前置依赖

- Phase 2 + Phase 3 均完成：两种 Pipeline 可独立运行

## Requirements

### R1: DB Schema 变更

```prisma
model AnalysisJob {
  architecture String @default("sequential") // "sequential" | "twopass"
}
```

- 新增 Prisma migration
- 默认值 `"sequential"` 确保向后兼容

### R2: API 变更

`POST /api/books/:id/analyze` 新增可选参数：

```typescript
{
  architecture?: "sequential" | "twopass"  // 默认 "sequential"
}
```

- route.ts 解析并写入 AnalysisJob.architecture
- runAnalysisJob 读取 job.architecture 路由到对应 Pipeline

### R3: 前端 UI

在 `/admin/books/import` Step 3 添加架构选择器：

```tsx
<RadioGroup value={architecture} onChange={setArchitecture} defaultValue="sequential">
  <Radio value="sequential" label="按章节顺序解析" description="逐章积累人物上下文，准确率高（推荐）" />
  <Radio value="twopass" label="两遍式并行解析" description="先提取后消歧，速度快成本低" />
</RadioGroup>
```

- 默认选中 "sequential"
- 选择值传入 `startAnalysis(bookId, { architecture, ... })`

### R4: 模型策略表单联动

- 选择 "sequential" 时：隐藏 INDEPENDENT_EXTRACTION、ENTITY_RESOLUTION 阶段配置
- 选择 "twopass" 时：隐藏 ROSTER_DISCOVERY 阶段配置
- 使用条件渲染实现

### R5: 重新解析支持

- 书籍详情页的"重新解析"按钮应继承上次选择的 architecture
- 或者提供重新选择的入口

## 涉及文件

- `prisma/schema.prisma` — 新增 architecture 字段
- `prisma/migrations/` — 新增 migration
- `src/app/api/books/[id]/analyze/route.ts` — 解析 architecture 参数
- `src/server/modules/analysis/jobs/runAnalysisJob.ts` — 路由到 Pipeline
- `src/app/admin/books/import/page.tsx` — 架构选择器 UI
- `src/lib/services/books.ts` — StartAnalysisBody 扩展
- `src/app/admin/_components/model-strategy-form.tsx` — 条件隐藏阶段
