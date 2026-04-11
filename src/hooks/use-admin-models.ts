"use client";

/**
 * ============================================================================
 * 文件定位：`src/hooks/use-admin-models.ts`
 * ----------------------------------------------------------------------------
 * 管理端 AI 模型列表 Store Hook。
 *
 * 设计目标：
 * - 模块级缓存：同一页面会话内不重复请求 `/api/admin/models`；
 * - 统一出口：所有需要模型列表的组件（知识库生成弹框、书籍导入、策略面板）
 *   通过该 hook 获取，消除各自独立维护 state + fetch 的散逻辑；
 * - 返回值保持稳定引用（仅数据变更时重渲）。
 *
 * 使用示例：
 * ```tsx
 * const { models, loading, defaultModel } = useAdminModels({ onlyEnabled: true });
 * ```
 * ============================================================================
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchModels, type AdminModelItem } from "@/lib/services/models";

/* ------------------------------------------------------------------ */
/*  模块级缓存（单例）                                                  */
/* ------------------------------------------------------------------ */

/** 已缓存的模型列表；null 表示尚未拉取。 */
let modelCache: AdminModelItem[] | null = null;

/** 正在进行中的拉取 Promise；合并并发请求（防止重复飞出多条请求）。 */
let cachePromise: Promise<AdminModelItem[]> | null = null;

/* ------------------------------------------------------------------ */
/*  Options & Result                                                    */
/* ------------------------------------------------------------------ */

interface UseAdminModelsOptions {
  /**
   * 是否只返回已启用的模型（`isEnabled = true`）。
   * 生成弹框建议开启，避免把禁用模型暴露给用户。
   * 默认：`false`（返回全量列表）。
   */
  onlyEnabled?: boolean;
}

export interface UseAdminModelsResult {
  /** 模型列表（已按 `onlyEnabled` 过滤）。 */
  models      : AdminModelItem[];
  /** 是否正在加载。 */
  loading     : boolean;
  /** 加载错误文案；null 表示无错误。 */
  error       : string | null;
  /**
   * 默认模型（`isDefault=true` 优先；无默认时取第一条）。
   * 可直接用于初始化 `selectedModelId`。
   */
  defaultModel: AdminModelItem | undefined;
  /**
   * 强制重新拉取（绕过缓存）。
   * 通常在模型设置页面保存后调用，让其他组件感知变更。
   */
  refresh     : () => void;
}

export function useAdminModels(opts?: UseAdminModelsOptions): UseAdminModelsResult {
  const onlyEnabled = opts?.onlyEnabled ?? false;

  // 若缓存已有，直接初始化为非空，避免首次渲染 loading 闪烁。
  const [allModels, setAllModels] = useState<AdminModelItem[]>(modelCache ?? []);
  const [loading, setLoading]     = useState<boolean>(!modelCache);
  const [error, setError]         = useState<string | null>(null);
  // forceCount 用于驱动 refresh：每次 +1 触发 useEffect 重跑
  const [forceCount, setForceCount] = useState(0);
  const isForced = useRef(false);

  const refresh = useCallback(() => {
    isForced.current = true;
    setForceCount((n) => n + 1);
  }, []);

  useEffect(() => {
    const forced = isForced.current;
    isForced.current = false;

    // 缓存命中且不强制刷新 → state 初始化时已从缓存同步，直接返回
    if (!forced && modelCache) {
      return;
    }

    // 强制刷新时清除旧 promise 以重建
    if (forced) {
      cachePromise = null;
    }

    let cancelled = false;

    async function fetchAndUpdate() {
      setLoading(true);
      setError(null);

      if (!cachePromise) {
        cachePromise = fetchModels();
      }

      try {
        const result = await cachePromise;
        if (!cancelled) {
          modelCache = result;
          setAllModels(result);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "模型列表加载失败");
          setLoading(false);
          cachePromise = null;
        }
      }
    }

    void fetchAndUpdate();
    return () => { cancelled = true; };
  }, [forceCount]);

  // 按 onlyEnabled 过滤
  const models = onlyEnabled ? allModels.filter((m) => m.isEnabled) : allModels;

  // 默认模型：isDefault 优先，其次取 first
  const defaultModel = models.find((m) => m.isDefault) ?? models[0];

  return { models, loading, error, defaultModel, refresh };
}
