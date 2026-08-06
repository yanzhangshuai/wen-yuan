# 身份解析域（Pass0 + 登记表）

## Goal

实现 v5.1 承重墙：双 tier 身份解析 + 身份登记表（派生视图）+ 身份判定原语 + 分布式冲突扫描 + reconcile。产出"身份登记表"供 Pass1 分片提取映射。

## Requirements

- **身份登记表 = 派生视图（无新表）**：物理载体 = entities（canonical 全局）+ aliases（书级，status/confidence/recordSource 骑身份置信）+ mentions（证据/活跃章区）+ entity_profiles。HIGH/MEDIUM/LOW 为派生分类（aliases.status + confidence + 提及数 + 活跃章区重叠推导）。
- **identityService 单一写路径**：Tier1 / Tier2 / reconcile / 跨模型复核四路回写统一走它，写 entities/aliases/mentions + `agent_write_audits` 审计。
- **身份判定原语**：局部采样窗口（≤15，按章分层）+ 全局登记表 + 全书摘要 → 单次判定；HIGH 组合规则 = LLM 判定 resolved ∧ 提及数≥2 ∧ 分布式扫描干净 ∧ 采样窗口一致。
- **分布式冲突扫描**：按章分布判误归属（别名活跃章区只与 Y 重合、从不与 X 重合 → 重归属 Y；与 X/Y 均重合 = 正常共现不标记）。同一代码路径跑两次（Tier2 候选级 / Pass3 全量终扫）。
- **Tier1**：全书一遍草稿登记表（1-2 次调用）；输出过大按人物/地点/组织拆 2-3 次；A/B 校准表选单遍或分卷（分卷一等路径：相邻卷重叠 + 原语卷级合并）。
- **Tier2**：残余候选（冲突/低置信/漏网高频/跨卷边界/风险集中类）走原语。
- **reconcile**：位于 Pass1 与 Pass3 之间；DB 扫"提及数≥N 不在登记表"表面形式 → 原语补判 → 回写；边界 = 只补覆盖缺失，不补系统误判（后者靠跨模型/人审）。

## Acceptance Criteria

- [ ] identityService 写路径实现，四路回写 + `agent_write_audits` 审计落全
- [ ] 登记表派生查询（按书）返回 HIGH/MEDIUM/LOW 分级正确
- [ ] 身份判定原语 HIGH 组合规则四条件实现；提及数≥2、窗口一致、扫描干净
- [ ] 分布式冲突扫描：同场共现不误报（范老爷/范进同框不标记），真误归属能检出
- [ ] Tier1 全书一遍调用实现（含输出分片合并）；分卷路径（重叠衔接 + 卷级合并）实现
- [ ] Tier2 残余候选处理（分层采样 ≤15 窗口）实现
- [ ] reconcile 时序保证（Pass1 后、Pass3 前），漏网高频补判入库
- [ ] 单测覆盖：原语/扫描/登记表/identityService（行覆盖 ≥90%）

## Constraints

- 无工具循环：原语是"一次调用 + DB 预取"，不是 agent 循环
- 高置信 = 组合规则，模型自报置信只作弱输入（置信参与，绝不独裁）
- 跨模型复核在本任务只留接口（定向风险集中类），实现在 `v5-review`

## Dependencies

- 依赖 `v5-data-model`（entities/aliases/mentions/agent_runs 形态就绪）。
- 下游：`v5-extraction`（登记表是映射基底）、`v5-review`（自动接受读登记表 HIGH）。
