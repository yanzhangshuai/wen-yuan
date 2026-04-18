# feat: 新 projection 读路径切换与旧真相退役

## Goal

把管理端审核页、人物详情、关系视图等读路径切换到新 projection 真相，并系统性下线旧 `Profile / BiographyRecord / Relationship` 草稿审核入口，完成 Evidence-first 架构切流。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §3.2, §4, §7.7, §8, §12, §13.3, §15

## Files

- Modify/Create: `src/app/admin/review/**`
- Modify/Create: `src/app/**`
- Modify/Create: `src/server/modules/review/**`
- Create: `src/app/**/*.test.ts`

## Requirements

### 1. Read-path cutover

- 人物审核、关系审核、时间审核、人物详情等后台主视图统一读取 projection
- 新读路径不得回退拼接旧 draft truth 表
- 对外展示页如仍依赖旧读模型，必须显式列出迁移清单并逐步切换

### 2. Legacy retirement

- 退役或隐藏旧 `listDrafts`、旧 review tabs、旧直接写正式图谱路径
- 保留必要的只读兼容层时，必须标注为临时迁移层
- 不要求兼容旧解析结果作为主真相

### 3. Safe cutover

- 切换前后需要有对账手段，至少校验人物、章节事实、关系边数量与抽样证据可追溯性
- projection rebuild 失败时要有回滚或只读降级策略
- 切流必须以 T21 回归结果和 T22 验收为前置条件

## Acceptance Criteria

- [ ] 审核主页面只读新 projection，不再依赖旧草稿真相
- [ ] 旧 review 入口被退役、隐藏或明确标注迁移状态
- [ ] 切流具备对账与失败保护机制
- [ ] 新旧路径边界清晰，避免双写双读长期并存

## Definition of Done

- [ ] 关键读路径切换完成并有验证记录
- [ ] 旧审核主路径职责退出
- [ ] Evidence-first projection 成为唯一审核读真相
