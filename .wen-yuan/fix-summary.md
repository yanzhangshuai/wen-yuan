# Wen-Yuan 工作流修复总结

## 修复日期
2026-03-04

## 修复目标
明确 OpenSpec 和 Trellis 的职责边界：
- **OpenSpec**: 业务/功能规范（需求、设计、功能变更）
- **Trellis**: 技术/代码规范（工程标准、代码质量、执行流程）

## 完成的修复

### Phase 1: 清理 Spec-Kit 残留 ✅
- 归档 `.agents/skills/speckit-*` 技能到 `.archive/`
- 归档 `.gemini/commands/speckit.*.toml` 到 `.archive/`
- 移除 workflow.md 中的 `.specify` 引用
- 添加 `.archive/` 到 `.gitignore`

### Phase 2: 明确内容归属 ✅
- 创建 `openspec/specs/` 业务规范结构：
  - `domain/` - 业务领域模型
  - `features/` - 功能需求规范
  - `constraints/` - 产品约束
- 创建完整的功能变更示例：`openspec/changes/example-character-relationship-viz/`
  - `proposal.md` - 功能提案
  - `design.md` - 设计方案
  - `tasks.md` - 实现任务
  - `spec-delta.md` - 规范增量
- 确认工程标准保留在 `.trellis/spec/`

### Phase 3: 统一文档引用 ✅
- 更新 `.agents/skills/start/SKILL.md`：移除所有 `/speckit.*` 引用
- 更新 `AGENTS.md`：统一脚本路径为 `flow_feature_init.sh`
- 更新 `GEMINI.md`：统一脚本路径，明确职责分工
- 更新 `.trellis/spec/guides/openspec-trellis-playbook.md` 和中文版
- 更新 `.trellis/workflow.md` 和中文版

### Phase 4: 验证与测试 ✅
- 验证 OpenSpec 目录结构正确
- 验证脚本可执行（`flow_feature_init.sh` 转发到 `flow_feature_init_openspec.sh`）
- 验证 task.py 脚本正常
- 验证示例文档完整

## 新的清晰边界

### OpenSpec 职责（业务/功能层）
```
openspec/
├── specs/              # 业务规范
│   ├── domain/        # 业务领域模型
│   ├── features/      # 功能需求规范
│   └── constraints/   # 产品约束
├── changes/           # 功能变更
│   └── <change>/
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── spec-delta.md
├── templates/         # 业务模板
└── CONSTITUTION.md    # 产品宪法
```

### Trellis 职责（技术/代码层）
```
.trellis/
├── spec/              # 工程标准
│   ├── frontend/     # 前端规范
│   ├── backend/      # 后端规范
│   └── guides/       # 执行指南
├── scripts/          # 门禁脚本
├── tasks/            # 任务管理
└── workflow.md       # 执行流程
```

## 工作流程

### Speed Strategy（速度优先）
```bash
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<requirement>"
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# 实现功能
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

### Strict Strategy（严格策略）
```bash
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<requirement>"
# 补齐 OpenSpec 文档
python3 ./.trellis/scripts/task.py flow-confirm
# 实现功能
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
```

## Git 状态

已删除文件：
- 9 个 speckit skills
- 9 个 speckit commands
- .specify/ 目录及所有内容

已修改文件：
- workflow.md / workflow.zh.md
- AGENTS.md / GEMINI.md
- start/SKILL.md
- openspec-trellis-playbook.md / .zh.md

新增文件：
- openspec/specs/ 业务规范结构
- openspec/changes/example-character-relationship-viz/ 示例

## 下一步建议

1. 提交这些修复：
   ```bash
   git commit -m "fix: 明确 OpenSpec 和 Trellis 职责边界

   - OpenSpec: 业务/功能规范
   - Trellis: 技术/代码规范
   - 移除 speckit 残留
   - 统一文档引用
   - 创建业务规范示例"
   ```

2. 测试完整工作流：
   - 尝试运行 Speed Strategy
   - 尝试运行 Strict Strategy
   - 验证 OpenSpec 文档生成

3. 补充更多业务规范：
   - 在 `openspec/specs/domain/` 补充领域模型
   - 在 `openspec/specs/features/` 补充功能需求

## 参考文档

- 修复计划：`.wen-yuan/fix-plan.md`
- 工作流：`.trellis/workflow.md`
- 协作手册：`.trellis/spec/guides/openspec-trellis-playbook.md`
