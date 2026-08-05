# P0 Provider 层工具调用基建

> 属父任务 `08-05-agent-architecture-refactor` 的 P0 阶段，完整设计见父任务 `design.md` §P0。

## Goal

让 `AiProviderClient` 支持工具调用（function calling），新增 `chat()`；`AiCallExecutor` 新增 `executeChat`（与旧 `execute` 共享 retry/fallback/phase-log 核心）；新增 EmbeddingClient；模型能力协商（`supportsTools`）。

## Requirements

- **R-P0.1** 新增 `src/server/providers/ai/types.ts`：`AiToolDefinition`（JSON Schema 子集）、`AiChatMessage`、`AiToolCall`、`AiChatResult`、`AiChatOptions`（含 `tools` + `responseTool`）。
- **R-P0.2** `AiProviderClient` 增加 `chat(messages, options)`，保留 `generateJson` 兼容。
- **R-P0.3** OpenAiCompatibleClient：tools 数组 + `tool_choice`（传 responseTool 时强制终态工具且不下发 response_format）；解析 `message.tool_calls`；role=tool 回传；与现有 `webSearchStyle="tools"` 合并，qwen 走 `enable_search`。
- **R-P0.4** GeminiClient：`functionDeclarations` + `toolConfig`（responseTool → ANY）；`functionResponse` 映射；解析 `response.functionCalls()`。
- **R-P0.5** 新增 `embeddingClient.ts`（openai-compatible `POST /embeddings`）。
- **R-P0.6** Prisma：`AiModel.supportsTools`（默认 false）+ migrate + generate。
- **R-P0.7** `ModelStrategyResolver` 将 `supportsTools` 透传到 `ResolvedStageModel/ResolvedFallbackModel`。
- **R-P0.8** `AiCallExecutor.executeChat`：泛化 `executeWithModel` 共享重试/fallback/`analysis_phase_logs`。
- **R-P0.9** `supportsTools=false` 降级：responseTool → prompt 内 JSON schema + `generateJson` 单次路径。

## Acceptance Criteria

- [ ] executeChat 单测全绿（请求体/tools/responseTool/重试/fallback/phase log）
- [ ] 旧 `execute` 回归不回归（generateJson 路径不受影响）
- [ ] `pnpm type-check` 通过；`pnpm test` 覆盖率达标
- [ ] 不支持工具模型降级路径有单测覆盖
