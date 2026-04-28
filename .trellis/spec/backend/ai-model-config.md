# AI 模型配置契约

> 适用于管理员模型配置、模型客户端创建、连通性测试、导入导出与模型策略解析。

## Scenario: 自定义模型配置

### 1. Scope / Trigger

- Trigger: `AiModel` schema、Admin API、模型客户端工厂与管理端 UI 同时变更。
- 目标：管理员可以不改代码新增模型 provider，并通过 `protocol` 决定客户端协议。
- 边界：`provider` 是展示与分组字符串；`protocol` 才是运行时分发依据。

### 2. Signatures

- DB: `AiModel.provider: string`
- DB: `AiModel.protocol: "openai-compatible" | "gemini"`
- DB unique: `(provider, modelId, baseUrl)`
- DB unique: `aliasKey` when non-null
- Service: `createModel(input)`
- Service: `updateModel(id, input)`
- Service: `deleteModel(id)`
- Service: `exportModels()`
- Service: `importModels(payload)`
- Provider factory: `createAiProviderClient({ protocol, apiKey, baseUrl, modelName })`
- Routes:
  - `GET /api/admin/models`
  - `POST /api/admin/models`
  - `PATCH /api/admin/models/[id]`
  - `DELETE /api/admin/models/[id]`
  - `GET /api/admin/models/export`
  - `POST /api/admin/models/import`

### 3. Contracts

- Create/update request fields:
  - `provider`: non-empty string
  - `protocol`: `openai-compatible` or `gemini`
  - `name`: non-empty display name
  - `modelId`: provider model id
  - `baseUrl`: optional HTTP(S) endpoint
  - `apiKey`: encrypted at rest
  - `aliasKey`: optional globally unique stable strategy key
- Export response:
  - includes model metadata needed to recreate configuration
  - never includes plaintext or encrypted `apiKey`
- Import request:
  - upserts by `aliasKey` first when present
  - otherwise upserts by `(provider, modelId, baseUrl)`
  - never overwrites an existing `apiKey`
- Runtime factory:
  - `openai-compatible` dispatches to the shared OpenAI-compatible client
  - `gemini` dispatches to Gemini client
  - adding a new provider name must not require factory changes when protocol is unchanged

### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| `provider` empty | reject as validation error |
| `protocol` outside supported values | reject as validation error |
| duplicate `(provider, modelId, baseUrl)` | reject create/import before commit |
| duplicate non-null `aliasKey` | reject create/import before commit |
| deleting `isDefault = true` model | reject with "switch default first" guidance |
| deleting model referenced by `ModelStrategyConfig.aliasKey` or `modelId` | reject and include referencing books/configs when available |
| export requested | omit `apiKey` completely |
| import includes `apiKey` | ignore it; do not overwrite persisted key |
| connectivity `baseUrl` resolves to localhost/private/link-local IP | reject before issuing provider request |
| connectivity `baseUrl` resolves only to public IPs | allow request attempt |

### 5. Good/Base/Bad Cases

- Good: `provider="DeepSeek"`, `protocol="openai-compatible"`, public `baseUrl`, unique `aliasKey`.
- Base: `provider="My Gateway"` creates a new UI group while sharing the OpenAI-compatible client.
- Bad: `provider="DeepSeek"` but `protocol="gemini"` for an OpenAI-compatible endpoint; validation may pass, but connectivity should expose the protocol mismatch.
- Bad: `baseUrl="http://127.0.0.1:11434"` must fail SSRF validation.

### 6. Tests Required

- Service unit tests:
  - create/update validation and duplicate rejection
  - delete default-model protection
  - delete strategy-reference protection
  - export API-key omission
  - import upsert precedence and API-key preservation
- Provider tests:
  - protocol-based dispatch for OpenAI-compatible and Gemini
  - unsupported protocol failure
- Connectivity tests:
  - localhost/private IPv4 rejection
  - IPv6 loopback/ULA/link-local rejection
  - DNS resolved private address rejection
  - public host request path allowed
- Route tests:
  - admin auth failure
  - Zod validation failure
  - known model configuration errors mapped to stable error responses
  - unexpected errors mapped to generic server errors

### 7. Wrong vs Correct

#### Wrong

```ts
switch (provider) {
  case "deepseek":
    return createDeepSeekClient(input);
  case "qwen":
    return createQwenClient(input);
}
```

#### Correct

```ts
switch (protocol) {
  case "openai-compatible":
    return createOpenAiCompatibleClient(input);
  case "gemini":
    return createGeminiClient(input);
}
```

Reason: `provider` is administrator-controlled display/grouping data. Runtime compatibility is a protocol concern.
