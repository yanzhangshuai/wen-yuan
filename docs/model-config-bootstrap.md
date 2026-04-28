# Model Config Bootstrap

AI model rows are no longer seeded by `prisma/seed.ts`. Existing rows are preserved by migration, and new deployments should add the first model from the admin UI.

## First Model

1. Sign in as an admin and open `/admin/model`.
2. When the table is empty, use the "添加第一个模型" flow.
3. Keep `protocol` as `openai-compatible` for DeepSeek, Qwen, Doubao, GLM, OpenAI-compatible gateways, and most aggregation gateways.
4. Use `gemini` only for Google Gemini native `generateContent` endpoints.
5. Enter `provider`, `name`, `modelId`, `baseUrl`, and `apiKey`.
6. Click connectivity test, then enable the model and set it as default.

Example DeepSeek bootstrap values:

```text
provider: DeepSeek
protocol: openai-compatible
name: DeepSeek V4
modelId: deepseek-chat-v4
baseUrl: https://api.deepseek.com
aliasKey: deepseek-v4
```

## Import And Export

Use `/admin/model` to export or import model configuration JSON. Exports never include API keys. Imports upsert by `aliasKey` first, then by `(provider, modelId, baseUrl)`, and never overwrite an existing stored API key.

After importing models into a fresh environment, open each imported row and set the API key before enabling it.
