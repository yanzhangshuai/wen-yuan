# Zustand Store Template

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/zustand-store-template.md
> Mirror: .trellis/spec/frontend/zustand-store-template.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> Project-standard template for directory layout, naming, selectors, and actions.

---

## Directory Layout

Use feature-scoped store files:

```text
src/features/<feature>/store/
|- <feature>-store.types.ts
|- <feature>-store.ts
|- <feature>-store.selectors.ts
\- index.ts
```

Example:

```text
src/features/analyze/store/
|- analyze-store.types.ts
|- analyze-store.ts
|- analyze-store.selectors.ts
\- index.ts
```

---

## Naming Rules

- Store hook: `use<Feature>Store` (e.g. `useAnalyzeStore`).
- State type: `<Feature>StoreState`.
- Actions type: `<Feature>StoreActions`.
- Store type: `<Feature>Store = <Feature>StoreState & <Feature>StoreActions`.
- Selector helpers: `use<Feature><Field>` or `use<Feature><Domain>`.
- Action names use clear verbs: `setXxx`, `toggleXxx`, `resetXxx`, `openXxx`.

---

## File Template

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

## Usage Rules

- Components should consume selectors instead of reading the whole store.
- Keep store actions synchronous and predictable; keep network effects in
  server actions/services.
- Store only UI/app interaction state, not long-lived server entity caches.
- Keep one store focused on one feature domain.
