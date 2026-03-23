# 踩坑文档索引

> 记录在本项目开发过程中遇到的生产级问题与解决方案。
> 这些问题往往不容易从文档中发现，通过记录可避免重复踩坑。

## 严重等级

| 等级 | 说明 |
|------|------|
| Critical | 构建失败或数据损坏 |
| Warning | 体验降级，有规避方案 |
| Info | 轻微视觉问题，发现后容易修复 |

---

## 问题索引

| 问题 | 分类 | 严重等级 |
|------|------|---------|
| [postgresql-json-jsonb.md](./postgresql-json-jsonb.md) | 数据库 | Critical |
| [turbopack-webpack-flexbox.md](./turbopack-webpack-flexbox.md) | 构建系统 | Warning |
| [webkit-tap-highlight.md](./webkit-tap-highlight.md) | 移动端/CSS | Info |

---

## 如何贡献

发现新的踩坑？按以下步骤添加：

1. 在此目录创建 `kebab-case.md` 文件
2. 按格式填写：问题现象 / 根因 / 解决方案 / 关键结论
3. 在本索引表中添加对应条目（含分类和严重等级）
4. 尽量提供可复现的代码示例
