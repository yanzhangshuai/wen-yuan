# fix: 多选框在四个主题下不明显 + 替换原生 checkbox

## Goal

修复 `<Checkbox>` 组件在四个主题下边框对比度不足、未选中状态几乎不可见的问题；并替换导入向导 step3 "多选指定章节"模式中的原生 `<input type="checkbox">`。

## What I already know

- 项目有 4 套命名主题：丹青（深色）、星空（极深色）、靛藏（暖深色）、素雅（浅色）。
- 所有主题的 `--border` 与 `--background` 亮度差值均低于 0.15（星空/素雅仅约 0.10）。
- `src/components/ui/checkbox.tsx` 未选中状态是"透明背景 + `border-border`"，实际上与背景融合。
- `src/app/admin/books/import/page.tsx` step3 的章节多选使用了原生 `<input type="checkbox">`，不受主题控制。

## Assumptions

- 不新增 CSS token（不添加 `--checkbox-border` 等变量），只用 Tailwind 语义类修复。
- `bg-muted/20` 可在四个主题下均提供足够的视觉边界，同时不干扰选中态。

## Requirements

- `Checkbox` 未选中状态添加 `bg-muted/20` 背景填充。
- 选中/indeterminate 状态视觉不受影响（`data-[state=checked]:bg-primary` 覆盖）。
- 导入向导 step3 章节列表替换为 `<Checkbox>` 组件（使用 `onCheckedChange` API）。
- 全局确认 `src/app/admin` 下无其他原生 checkbox 残留。

## Acceptance Criteria

- [ ] 四个主题下 Checkbox 边框均清晰可见
- [ ] 选中态视觉正常（不受影响）
- [ ] 导入向导 step3 章节多选使用 `<Checkbox>` 组件
- [ ] `pnpm type-check` 通过
- [ ] `pnpm lint` 通过

## Definition of Done

- 代码修改已提交
- 四个主题下手动验证 Checkbox 可见性

## Out of Scope

- 不修改 CSS token 值
- 不重构知识库表格组件
- 不修改书籍信息相关内容（另一个任务）

## Technical Notes

**文件 A1：** `src/components/ui/checkbox.tsx`
```diff
- "peer border-border data-[state=checked]:bg-primary ...
+ "peer border-border bg-muted/20 data-[state=checked]:bg-primary ...
```

**文件 A2：** `src/app/admin/books/import/page.tsx` — 找到 `type="checkbox"` 原生节点，替换：
```tsx
// 旧
<input type="checkbox" checked={...} onChange={(e) => {...}} />

// 新（注意 API 差异：onCheckedChange 而非 onChange）
<Checkbox checked={...} onCheckedChange={(checked) => {...}} />
```

**全局确认命令：**
```bash
grep -rn 'type="checkbox"' src/app/admin --include="*.tsx"
```

## 参考计划文档

`docs/superpowers/plans/2026-04-17-checkbox-book-info-plan.md` — Task A 部分（A-1 至 A-3）
