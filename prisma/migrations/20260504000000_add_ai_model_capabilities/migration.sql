-- 为 ai_models 增加能力声明字段：
-- supports_thinking：是否支持深度思考（reasoning/thinking 模式）；
-- supports_web_search：是否支持联网搜索（不同协议落地参数不同）。
ALTER TABLE "ai_models" ADD COLUMN "supports_thinking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_models" ADD COLUMN "supports_web_search" BOOLEAN NOT NULL DEFAULT false;
