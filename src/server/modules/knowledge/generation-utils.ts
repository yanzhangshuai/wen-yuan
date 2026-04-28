import { type z } from "zod";

import { prisma } from "@/server/db/prisma";
import { createAiProviderClient, type AiProviderProtocol } from "@/server/providers/ai";
import { decryptValue } from "@/server/security/encryption";
import { repairJson } from "@/types/analysis";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/knowledge/generation-utils.ts`
 * ----------------------------------------------------------------------------
 * 知识库“模型生成”公共工具层。
 *
 * 设计目标：
 * - 统一“选模型 -> 调模型 -> 解析 JSON -> schema 校验”链路；
 * - 降低 alias/surname/title 三类生成服务的重复实现与策略漂移；
 * - 在失败时输出可读错误，避免前端只看到“无可用模型”。
 * ============================================================================
 */

export interface KnowledgeGenerationModelInfo {
  id       : string;
  provider : string;
  protocol : AiProviderProtocol;
  modelName: string;
}

interface ResolvedGenerationModel extends KnowledgeGenerationModelInfo {
  apiKey  : string;
  baseUrl?: string;
}

/**
 * 功能：解析并返回本次知识库生成可用的模型配置。
 * 输入：可选 `selectedModelId`；为空时自动选择“默认优先 + 最近更新”的可用模型。
 * 输出：带解密 API Key 的运行时模型配置。
 * 异常：
 * - 指定模型不存在/禁用/未配置 Key；
 * - 无任何可用模型。
 * 副作用：读取数据库模型表并执行一次密钥解密。
 */
export async function getKnowledgeGenerationModel(selectedModelId?: string): Promise<ResolvedGenerationModel> {
  const select = {
    id      : true,
    provider: true,
    protocol: true,
    modelId : true,
    apiKey  : true,
    baseUrl : true
  } as const;

  const model = selectedModelId
    ? await prisma.aiModel.findFirst({
      where: {
        id       : selectedModelId,
        isEnabled: true,
        apiKey   : { not: null }
      },
      select
    })
    : await prisma.aiModel.findFirst({
      where: {
        isEnabled: true,
        apiKey   : { not: null }
      },
      orderBy: [
        { isDefault: "desc" },
        { updatedAt: "desc" }
      ],
      select
    });

  if (!model?.apiKey) {
    throw new Error(selectedModelId
      ? "选定模型不可用，请确认模型已启用并完成 Key 配置"
      : "未找到可用的已启用模型，请先在模型管理中配置默认模型");
  }

  return {
    id       : model.id,
    provider : model.provider,
    protocol : model.protocol as AiProviderProtocol,
    modelName: model.modelId,
    apiKey   : decryptValue(model.apiKey),
    baseUrl  : model.baseUrl ?? undefined
  };
}

/**
 * 功能：执行通用的知识库 JSON 生成流程并做 schema 级输出校验。
 * 输入：模型选择参数、系统/用户提示词、目标 schema、生成超参。
 * 输出：
 * - `parsed`：通过 schema 校验后的强类型结果；
 * - `rawContent`：模型原始输出（便于审计与问题回放）；
 * - `model`：本次实际使用的模型信息。
 * 异常：
 * - 模型调用失败；
 * - JSON 修复/解析失败；
 * - schema 校验失败。
 * 副作用：调用外部模型提供商接口。
 */
export async function executeKnowledgeJsonGeneration<TSchema extends z.ZodTypeAny>(input: {
  selectedModelId?: string;
  systemPrompt    : string;
  userPrompt      : string;
  schema          : TSchema;
  temperature?    : number;
  maxOutputTokens?: number;
  topP?           : number;
}): Promise<{ parsed: z.output<TSchema>; rawContent: string; model: KnowledgeGenerationModelInfo }> {
  const model = await getKnowledgeGenerationModel(input.selectedModelId);
  const providerClient = createAiProviderClient({
    provider : model.provider,
    protocol : model.protocol,
    apiKey   : model.apiKey,
    baseUrl  : model.baseUrl,
    modelName: model.modelName
  });

  const aiResult = await providerClient.generateJson({
    system: input.systemPrompt,
    user  : input.userPrompt
  }, {
    temperature    : input.temperature ?? 0.2,
    maxOutputTokens: input.maxOutputTokens ?? 8192,
    topP           : input.topP ?? 1
  });

  const rawContent = typeof aiResult.content === "string"
    ? aiResult.content
    : JSON.stringify(aiResult.content);
  const repaired = repairJson(rawContent);
  const parsedPayload: unknown = JSON.parse(repaired);
  const parsed = input.schema.parse(parsedPayload) as z.output<TSchema>;

  return {
    parsed    : parsed,
    rawContent: rawContent,
    model     : {
      id       : model.id,
      provider : model.provider,
      protocol : model.protocol,
      modelName: model.modelName
    }
  };
}
