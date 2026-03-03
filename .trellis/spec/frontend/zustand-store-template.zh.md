# Zustand Store 模板

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/frontend/zustand-store-template.md
> 镜像文档：.trellis/spec/frontend/zustand-store-template.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/zustand-store-template.md
> Mirror: .trellis/spec/frontend/zustand-store-template.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> 项目标准模板：目录布局、命名、selector 与 actions。

---

## 目录布局

使用按功能域拆分的 store 文件：

```text
src/features/<feature>/store/
|- <feature>-store.types.ts
|- <feature>-store.ts
|- <feature>-store.selectors.ts
\- index.ts
```

示例：

```text
src/features/analyze/store/
|- analyze-store.types.ts
|- analyze-store.ts
|- analyze-store.selectors.ts
\- index.ts
```

---

## 命名规则

- Store hook：`use<Feature>Store`（如 `useAnalyzeStore`）。
- State 类型：`<Feature>StoreState`。
- Actions 类型：`<Feature>StoreActions`。
- Store 类型：`<Feature>Store = <Feature>StoreState & <Feature>StoreActions`。
- Selector helper：`use<Feature><Field>` 或 `use<Feature><Domain>`。
- Action 名称使用清晰动词：`setXxx`、`toggleXxx`、`resetXxx`、`openXxx`。

---

## 文件模板

### 1) `<feature>-store.types.ts`

```ts
export interface AnalyzeStoreState {
  selectedChapterId: string | null;
  isFilterPanelOpen: boolean;
  keyword: string;
}

export interface AnalyzeStoreActions {
  setSelectedChapterId: (chapterId: string | null) => void;
  setKeyword: (keyword: string) => void;
  toggleFilterPanel: () => void;
  resetAnalyzeUiState: () => void;
}

export type AnalyzeStore = AnalyzeStoreState & AnalyzeStoreActions;
```

### 2) `<feature>-store.ts`

```ts
import { create } from "zustand";
import type { AnalyzeStore } from "./analyze-store.types";

const initialAnalyzeStoreState = {
  selectedChapterId: null,
  isFilterPanelOpen: false,
  keyword: "",
} as const;

export const useAnalyzeStore = create<AnalyzeStore>((set) => ({
  ...initialAnalyzeStoreState,
  setSelectedChapterId: (chapterId) => {
    set({ selectedChapterId: chapterId });
  },
  setKeyword: (keyword) => {
    set({ keyword });
  },
  toggleFilterPanel: () => {
    set((state) => ({ isFilterPanelOpen: !state.isFilterPanelOpen }));
  },
  resetAnalyzeUiState: () => {
    set(initialAnalyzeStoreState);
  },
}));
```

### 3) `<feature>-store.selectors.ts`

```ts
import { useShallow } from "zustand/react/shallow";
import { useAnalyzeStore } from "./analyze-store";

export const useAnalyzeSelection = () => {
  return useAnalyzeStore((state) => state.selectedChapterId);
};

export const useAnalyzeKeyword = () => {
  return useAnalyzeStore((state) => state.keyword);
};

export const useAnalyzePanelState = () => {
  return useAnalyzeStore(
    useShallow((state) => ({
      isFilterPanelOpen: state.isFilterPanelOpen,
      toggleFilterPanel: state.toggleFilterPanel,
    })),
  );
};
```

### 4) `index.ts`

```ts
export { useAnalyzeStore } from "./analyze-store";
export type {
  AnalyzeStore,
  AnalyzeStoreActions,
  AnalyzeStoreState,
} from "./analyze-store.types";
export {
  useAnalyzeKeyword,
  useAnalyzePanelState,
  useAnalyzeSelection,
} from "./analyze-store.selectors";
```

---

## 使用规则

- 组件应通过 selectors 消费状态，不要读取整个 store。
- store actions 保持同步且可预测；网络副作用放在 server actions/services。
- store 只保存 UI/应用交互状态，不保存长期服务端实体缓存。
- 一个 store 聚焦一个功能域。
