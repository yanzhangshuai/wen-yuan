# Wen-Yuan 工作流修复计划

## 目标（修正版）
- **OpenSpec**: 业务/功能规范（需求分析、功能设计、业务变更）
- **Trellis**: 技术/代码规范（工程标准、代码质量、执行流程）

## 问题清单

### 1. 职责边界混乱
- [ ] `.agents/skills/` 中有 speckit-* 技能（应移除或重命名）
- [ ] `start/SKILL.md` 引用 `/speckit.*` 命令（应改为 Trellis 命令）
- [ ] 脚本命名不统一（`flow_feature_init.sh` vs `flow_feature_init_openspec.sh`）

### 2. OpenSpec 内容缺失
- [ ] `openspec/specs/` 目录为空（应包含业务领域规范）
- [ ] `openspec/changes/` 没有示例（应有功能变更实例）
- [ ] `openspec/templates/` 存在但未被充分使用

### 3. 文档引用混乱
- [ ] `workflow.md` 引用路径不一致
- [ ] `AGENTS.md` 和 `start/SKILL.md` 流程冲突
- [ ] `.specify/` 残留引用需清理

## 修复步骤

### Phase 1: 清理边界（立即执行）

1. **移除 Trellis 中的 Spec-Kit 残留**
   ```bash
   # 删除或归档 speckit-* skills
   rm -rf .agents/skills/speckit-*

   # 清理 .gemini/commands/speckit.*.toml（或移到 archive）
   mkdir -p .gemini/commands/archive
   mv .gemini/commands/speckit.*.toml .gemini/commands/archive/
   ```

2. **统一脚本命名**
   ```bash
   # 只保留 openspec 版本
   rm .trellis/scripts/flow_feature_init.sh
   mv .trellis/scripts/flow_feature_init_openspec.sh .trellis/scripts/flow_feature_init.sh

   rm .trellis/scripts/flow_feature_upgrade_docs.sh
   mv .trellis/scripts/flow_feature_upgrade_docs_openspec.sh .trellis/scripts/flow_feature_upgrade_docs.sh
   ```

3. **清理 .specify 残留**
   ```bash
   # 确认删除（已在 git status 中标记删除）
   git rm -rf .specify/
   ```

### Phase 2: 明确内容归属（优先级高）

1. **工程标准保留在 Trellis**
   ```bash
   # .trellis/spec/engineering-standards/ 保留技术规范
   # 包括：API 规范、数据库规范、代码风格、测试标准等

   # 移除 openspec/specs/engineering-standards/
   rm -rf openspec/specs/engineering-standards/
   ```

2. **OpenSpec 聚焦业务规范**
   ```bash
   # openspec/specs/ 应包含：
   # - 业务领域模型（domain models）
   # - 功能需求规范（feature requirements）
   # - 产品约束（product constraints）

   # openspec/changes/ 包含：
   # - 功能变更提案（proposal.md）
   # - 业务设计（design.md）
   # - 实现任务（tasks.md）
   # - 规范增量（spec-delta.md）
   ```

3. **创建示例**
   ```bash
   # 在 openspec/changes/ 创建一个完整的功能变更示例
   # 展示业务需求 -> 设计 -> 任务分解的完整流程
   ```

### Phase 3: 统一文档（优先级中）

1. **更新 workflow.md**
   - 移除所有 `/speckit.*` 引用
   - 统一使用 `bash .trellis/scripts/flow_feature_init.sh`
   - 明确 OpenSpec 文件路径

2. **更新 AGENTS.md**
   - 移除 speckit 技能引用
   - 统一流程描述
   - 对齐 start/SKILL.md

3. **更新 start/SKILL.md**
   - 移除 `/speckit.*` 命令
   - 改用 Trellis 脚本
   - 简化流程描述

### Phase 4: 验证与测试（优先级中）

1. **测试 Speed Strategy**
   ```bash
   bash .trellis/scripts/flow_feature_init.sh --strategy fast "测试需求"
   python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
   ```

2. **测试 Strict Strategy**
   ```bash
   bash .trellis/scripts/flow_feature_init.sh --strategy strict "测试需求"
   python3 ./.trellis/scripts/task.py flow-confirm
   ```

3. **验证 OpenSpec 文件生成**
   - 检查 `openspec/changes/<change>/` 是否正确创建
   - 检查模板是否正确应用

## 新的清晰边界

### OpenSpec 职责（业务/功能层）
- **业务领域规范**（`openspec/specs/`）
  - 产品定位与约束
  - 业务领域模型
  - 功能需求规范
- **功能变更管理**（`openspec/changes/`）
  - 需求提案（proposal.md）
  - 业务设计（design.md）
  - 任务分解（tasks.md）
  - 规范增量（spec-delta.md）
- **业务模板**（`openspec/templates/`）
- **产品宪法**（`openspec/CONSTITUTION.md`）

### Trellis 职责（技术/代码层）
- **工程标准**（`.trellis/spec/`）
  - 前端规范（frontend/）
  - 后端规范（backend/）
  - 代码质量标准
  - API/数据库规范
- **执行流程**（`.trellis/workflow.md`）
- **门禁脚本**（`.trellis/scripts/`）
- **任务管理**（`.trellis/tasks/`）
- **执行指南**（`.trellis/spec/guides/`）
- **技能编排**（`.agents/skills/`）

### 交互点
1. **需求 -> 实现**：OpenSpec 定义"做什么"，Trellis 规范"怎么做"
2. **门禁验证**：Trellis 脚本验证 OpenSpec 文档完整性
3. **模板生成**：Trellis 脚本读取 OpenSpec 模板生成业务文档
4. **质量保证**：Trellis 标准确保 OpenSpec 需求的技术实现质量

## 成功标准

- [ ] 所有 speckit 引用已移除
- [ ] OpenSpec 规范文件已补全
- [ ] 工作流文档统一且无冲突
- [ ] 可以成功运行 Speed 和 Strict 策略
- [ ] 文档清晰描述两个系统的职责边界
