import type {
  ApiKeyChange,
  CreateModelInput,
  ModelConnectivityResult,
  ModelListItem,
  UpdateAdminModelPayload,
  UpdateModelInput
} from "./index";
import { createModelsModule } from "./index";

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
    providerModelId: payload.providerModelId,
    baseUrl        : payload.baseUrl,
    isEnabled      : payload.isEnabled,
    apiKey         : toApiKeyChange(payload.apiKey)
  });
}


export async function setDefaultAdminModel(id: string): Promise<ModelListItem> {
  return setDefaultModel(id);
}

export async function testAdminModelConnection(id: string): Promise<ModelConnectivityResult> {
  return testModelConnectivity(id);
}

export async function createAdminModel(input: CreateModelInput): Promise<ModelListItem> {
  return (await getDefaultModelsModule()).createModel(input);
}

export async function deleteAdminModel(id: string): Promise<void> {
  return (await getDefaultModelsModule()).deleteModel(id);
}

