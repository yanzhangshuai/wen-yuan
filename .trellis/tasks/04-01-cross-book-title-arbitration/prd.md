# 跨书通用化称谓识别与关系阻断（Phase1+2+3）

## Goal
按《跨书通用化称谓识别与关系阻断方案设计文档》完成第一轮可用落地：分层词表、运行时配置、evidence 分档门控与全书末灰区 AI 仲裁，确保默认可关闭、主链路稳定、回滚简单。

## Requirements
- 实现 Safety / Config / Evidence / LLM Arbitration 四层。
- 运行时注入 lexicon preset，不在每章循环调用 AI。
- gray_zone 收集并在全书后处理一次性批量仲裁。
- 仲裁结果不可直接成为最终不可回滚事实。
- 增加对应单测与集成测试，lint/test 通过。

## Acceptance Criteria
- [ ] Phase 1 规则分层、动态 pattern、runtime 注入完成。
- [ ] Phase 2 evidence 三档判定与 soft-block penalty 完成。
- [ ] Phase 3 全书末一次仲裁与上限控制完成。
- [ ] 新增/更新测试覆盖关键路径。
- [ ] lint 与测试通过。

## Technical Notes
- 优先无 schema 变更；仅在确实无法满足时再最小迁移。
- 主链路保持向后兼容，新增能力通过 feature flag 控制。
