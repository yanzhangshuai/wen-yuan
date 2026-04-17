# remove .dark theme legacy

## Goal

移除当前前端主题系统中残留的 `.dark` / `dark:` 机制，使主题实现完全收敛到 `data-theme + CSS variables + Tailwind semantic utilities`。

## Context

* 根布局使用 `next-themes` 的 `attribute="data-theme"`。
* 项目规范明确禁止继续使用 `.dark` / `dark:`。
* 当前 `src/components/ui`、`src/app/globals.css`、`src/components/ui/chart.tsx` 仍存在 `.dark` / `dark:` 残留。

## Requirements

* 新增一个回归测试，禁止 `src/` 内继续出现 `.dark` 或 `dark:` 残留。
* 清理当前主题系统中的 `.dark` / `dark:` 代码路径。
* 保持深色主题能力不变，继续由 `data-theme` token 驱动。
* 修正文档或注释中会误导维护者继续沿用 `.dark` 机制的内容。

## Acceptance Criteria

* 回归测试先失败，再在实现后通过。
* `src/` 内不再存在 `.dark` 或 `dark:` 样式残留。
* `pnpm test` 定向回归、`pnpm lint`、`pnpm type-check` 通过。

## Out Of Scope

* 不调整四套主题的视觉 token 值。
* 不引入新的按主题分支 class 机制。
