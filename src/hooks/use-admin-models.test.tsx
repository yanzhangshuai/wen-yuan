/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminModelItem } from "@/lib/services/models";

const fetchModelsMock = vi.fn();

function buildModel(overrides: Partial<AdminModelItem> = {}): AdminModelItem {
  return {
    id             : overrides.id ?? "model-1",
    provider       : overrides.provider ?? "qwen",
    name           : overrides.name ?? "Qwen Plus",
    providerModelId: overrides.providerModelId ?? "qwen-plus",
    aliasKey       : overrides.aliasKey ?? null,
    baseUrl        : overrides.baseUrl ?? "https://example.com",
    apiKeyMasked   : overrides.apiKeyMasked ?? "sk-***",
    isConfigured   : overrides.isConfigured ?? true,
    performance    : overrides.performance ?? {
      callCount          : 0,
      successRate        : null,
      avgLatencyMs       : null,
      avgPromptTokens    : null,
      avgCompletionTokens: null,
      ratings            : {
        speed    : 0,
        stability: 0,
        cost     : 0
      }
    },
    isEnabled: overrides.isEnabled ?? true,
    isDefault: overrides.isDefault ?? false,
    updatedAt: overrides.updatedAt ?? "2026-04-11T00:00:00.000Z"
  };
}

async function importHook() {
  vi.resetModules();
  vi.doMock("@/lib/services/models", () => ({
    fetchModels: fetchModelsMock
  }));
  return import("@/hooks/use-admin-models");
}

describe("useAdminModels", () => {
  it("filters disabled models and exposes default model under onlyEnabled mode", async () => {
    fetchModelsMock.mockReset();
    fetchModelsMock.mockResolvedValueOnce([
      buildModel({ id: "disabled-default", isEnabled: false, isDefault: true }),
      buildModel({ id: "enabled-a", isEnabled: true, isDefault: false }),
      buildModel({ id: "enabled-b", isEnabled: true, isDefault: true })
    ]);

    const { useAdminModels } = await importHook();

    const { result } = renderHook(() => useAdminModels({ onlyEnabled: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.models.map((model) => model.id)).toEqual(["enabled-a", "enabled-b"]);
    expect(result.current.defaultModel?.id).toBe("enabled-b");
    expect(fetchModelsMock).toHaveBeenCalledTimes(1);
  });

  it("reuses module cache across multiple hook consumers", async () => {
    fetchModelsMock.mockReset();
    fetchModelsMock.mockResolvedValueOnce([
      buildModel({ id: "model-cached", isEnabled: true, isDefault: true })
    ]);

    const { useAdminModels } = await importHook();

    const first = renderHook(() => useAdminModels({ onlyEnabled: true }));
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
    });

    const second = renderHook(() => useAdminModels({ onlyEnabled: true }));
    await waitFor(() => {
      expect(second.result.current.loading).toBe(false);
    });

    expect(fetchModelsMock).toHaveBeenCalledTimes(1);
    expect(second.result.current.models[0]?.id).toBe("model-cached");

    first.unmount();
    second.unmount();
  });

  it("refresh forces a second fetch and updates data", async () => {
    fetchModelsMock.mockReset();
    fetchModelsMock
      .mockResolvedValueOnce([buildModel({ id: "old-model", isEnabled: true, isDefault: true })])
      .mockResolvedValueOnce([buildModel({ id: "new-model", isEnabled: true, isDefault: true })]);

    const { useAdminModels } = await importHook();

    const { result } = renderHook(() => useAdminModels({ onlyEnabled: true }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.models[0]?.id).toBe("old-model");

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.models[0]?.id).toBe("new-model");
    });
    expect(fetchModelsMock).toHaveBeenCalledTimes(2);
  });
});
