import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { decryptValue, encryptValue, maskSensitiveValue } from "@/server/security/encryption";

type FetchImpl = typeof fetch;

const providerSchema = z.enum(["deepseek", "qwen", "doubao", "gemini"]);

const idSchema = z.string().trim().min(1, "模型 ID 不能为空");

const updateModelInputSchema = z.object({
  id       : idSchema,
  baseUrl  : z.string().trim().min(1, "BaseURL 不能为空").optional(),
  isEnabled: z.boolean().optional(),
  apiKey   : z.discriminatedUnion("action", [
    z.object({
      action: z.literal("unchanged")
    }),
    z.object({
      action: z.literal("clear")
    }),
    z.object({
      action: z.literal("set"),
      value : z.string().trim().min(1, "API Key 不能为空")
    })
  ]).optional()
});

interface AiModelRecord {
  id: string;
  provider: string;
  name: string;
  modelId: string;
  baseUrl: string;
  apiKey: string | null;
  isEnabled: boolean;
  isDefault: boolean;
  updatedAt: Date;
}

export interface ModelListItem {
  id: string;
  provider: "deepseek" | "qwen" | "doubao" | "gemini";
  name: string;
  modelId: string;
  baseUrl: string;
  isEnabled: boolean;
  isDefault: boolean;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  updatedAt: string;
}

export type ApiKeyChange =
  | { action: "unchanged" }
  | { action: "clear" }
  | { action: "set"; value: string };

export interface UpdateModelInput {
  id: string;
  baseUrl?: string;
  isEnabled?: boolean;
  apiKey?: ApiKeyChange;
}

export interface UpdateAdminModelPayload {
  baseUrl?: string;
  isEnabled?: boolean;
  apiKey?: string | null;
}

export interface ModelConnectivityResult {
  ok: boolean;
  latencyMs: number;
  detail: string;
}

const modelSelect = {
  id       : true,
  provider : true,
  name     : true,
  modelId  : true,
  baseUrl  : true,
  apiKey   : true,
  isEnabled: true,
  isDefault: true,
  updatedAt: true
} as const;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function readStoredApiKey(apiKey: string | null): string | null {
  if (!apiKey) {
    return null;
  }

  if (apiKey.startsWith("enc:v1:")) {
    return decryptValue(apiKey);
  }

  return apiKey;
}

function toModelListItem(model: AiModelRecord): ModelListItem {
  const plainApiKey = readStoredApiKey(model.apiKey);

  return {
    id          : model.id,
    provider    : providerSchema.parse(model.provider.toLowerCase()),
    name        : model.name,
    modelId     : model.modelId,
    baseUrl     : model.baseUrl,
    isEnabled   : model.isEnabled,
    isDefault   : model.isDefault,
    apiKeyMasked: maskSensitiveValue(plainApiKey),
    hasApiKey   : Boolean(plainApiKey),
    updatedAt   : model.updatedAt.toISOString()
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function extractResponseDetail(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        error?: { message?: string };
        message?: string;
      };

      if (payload.error?.message) {
        return payload.error.message;
      }

      if (payload.message) {
        return payload.message;
      }
    } else {
      const rawText = await response.text();
      if (rawText.trim()) {
        return rawText.trim().slice(0, 200);
      }
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function createModelsModule(
  prismaClient: PrismaClient,
  fetchImpl: FetchImpl = fetch
) {
  async function getModelRecord(id: string): Promise<AiModelRecord> {
    const model = await prismaClient.aiModel.findUnique({
      where : { id },
      select: modelSelect
    });

    if (!model) {
      throw new Error("模型不存在");
    }

    return model;
  }

  async function listModels(): Promise<ModelListItem[]> {
    const models = await prismaClient.aiModel.findMany({
      orderBy: [
        { isDefault: "desc" },
        { updatedAt: "desc" }
      ],
      select: modelSelect
    });

    return models.map(toModelListItem);
  }

  async function updateModel(input: UpdateModelInput): Promise<ModelListItem> {
    const parsedInput = updateModelInputSchema.parse(input);
    const currentModel = await getModelRecord(parsedInput.id);

    const nextBaseUrl = parsedInput.baseUrl ? normalizeBaseUrl(parsedInput.baseUrl) : currentModel.baseUrl;

    let nextEncryptedApiKey = currentModel.apiKey;
    let hasApiKey = Boolean(readStoredApiKey(currentModel.apiKey));

    if (parsedInput.apiKey?.action === "set") {
      nextEncryptedApiKey = encryptValue(parsedInput.apiKey.value.trim());
      hasApiKey = true;
    }

    if (parsedInput.apiKey?.action === "clear") {
      nextEncryptedApiKey = null;
      hasApiKey = false;
    }

    const nextIsEnabled = parsedInput.isEnabled ?? currentModel.isEnabled;
    if (nextIsEnabled && !hasApiKey) {
      throw new Error("启用模型前请先配置 API Key");
    }

    const updatedModel = await prismaClient.aiModel.update({
      where: { id: parsedInput.id },
      data : {
        baseUrl  : nextBaseUrl,
        isEnabled: nextIsEnabled,
        ...(parsedInput.apiKey ? { apiKey: nextEncryptedApiKey } : {})
      },
      select: modelSelect
    });

    return toModelListItem(updatedModel);
  }

  async function setDefaultModel(id: string): Promise<ModelListItem> {
    const parsedId = idSchema.parse(id);

    const updatedModel = await prismaClient.$transaction(async (tx) => {
      const existingModel = await tx.aiModel.findUnique({
        where : { id: parsedId },
        select: { id: true }
      });

      if (!existingModel) {
        throw new Error("模型不存在");
      }

      await tx.aiModel.updateMany({
        where: { isDefault: true },
        data : { isDefault: false }
      });

      return tx.aiModel.update({
        where: { id: parsedId },
        data : { isDefault: true },
        select: modelSelect
      });
    });

    return toModelListItem(updatedModel);
  }

  async function testModelConnectivity(id: string): Promise<ModelConnectivityResult> {
    const parsedId = idSchema.parse(id);
    const model = await getModelRecord(parsedId);
    const provider = providerSchema.parse(model.provider.toLowerCase());
    const apiKey = readStoredApiKey(model.apiKey);

    if (!apiKey) {
      throw new Error("模型未配置 API Key");
    }

    const baseUrl = normalizeBaseUrl(model.baseUrl);
    const startedAt = Date.now();

    try {
      let response: Response;

      if (provider === "gemini") {
        response = await fetchImpl(
          `${baseUrl}/v1beta/models/${model.modelId}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method : "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents        : [{ role: "user", parts: [{ text: "ping" }] }],
              generationConfig: {
                temperature    : 0,
                maxOutputTokens: 1
              }
            })
          }
        );
      } else {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization : `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model      : model.modelId,
            temperature: 0,
            max_tokens : 1,
            messages   : [{ role: "user", content: "ping" }]
          })
        });
      }

      const latencyMs = Date.now() - startedAt;
      const detail = await extractResponseDetail(response, response.ok ? "连接成功" : `HTTP ${response.status}`);

      return {
        ok: response.ok,
        latencyMs,
        detail
      };
    } catch (error) {
      return {
        ok       : false,
        latencyMs: Date.now() - startedAt,
        detail   : getErrorMessage(error, "模型连通性测试失败")
      };
    }
  }

  return {
    listModels,
    updateModel,
    setDefaultModel,
    testModelConnectivity
  };
}

async function getDefaultModelsModule() {
  const { prisma } = await import("@/server/db/prisma");
  return createModelsModule(prisma, fetch);
}

export async function listModels(): Promise<ModelListItem[]> {
  return (await getDefaultModelsModule()).listModels();
}

export async function updateModel(input: UpdateModelInput): Promise<ModelListItem> {
  return (await getDefaultModelsModule()).updateModel(input);
}

export async function setDefaultModel(id: string): Promise<ModelListItem> {
  return (await getDefaultModelsModule()).setDefaultModel(id);
}

export async function testModelConnectivity(id: string): Promise<ModelConnectivityResult> {
  return (await getDefaultModelsModule()).testModelConnectivity(id);
}

function toApiKeyChange(apiKey: string | null | undefined): ApiKeyChange | undefined {
  if (typeof apiKey === "undefined") {
    return { action: "unchanged" };
  }

  if (apiKey === null) {
    return { action: "clear" };
  }

  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    return { action: "unchanged" };
  }

  return {
    action: "set",
    value : trimmedApiKey
  };
}

/**
 * Admin route adapters: keep route layer contract stable while内部仍复用核心 models module。
 */
export async function listAdminModels(): Promise<ModelListItem[]> {
  return listModels();
}

export async function updateAdminModel(
  id: string,
  payload: UpdateAdminModelPayload
): Promise<ModelListItem> {
  return updateModel({
    id,
    baseUrl  : payload.baseUrl,
    isEnabled: payload.isEnabled,
    apiKey   : toApiKeyChange(payload.apiKey)
  });
}

export async function setDefaultAdminModel(id: string): Promise<ModelListItem> {
  return setDefaultModel(id);
}

export async function testAdminModelConnection(id: string): Promise<ModelConnectivityResult> {
  return testModelConnectivity(id);
}
