# 模型配置完全自定义化设计文档

**日期**：2026-04-25  
**状态**：待实施  
**分支**：dev_2

---

## 问题陈述

当前模型配置存在以下痛点：

1. `provider` 字段硬编码为 TypeScript 枚举 `"deepseek" | "qwen" | "doubao" | "gemini" | "glm"`，新供应商或同一供应商的新 API 版本（如 DeepSeek V4）无法添加
2. 模型列表通过 `prisma/seed.ts` 预置，页面上无法新增或删除模型
3. SSRF 防护使用白名单机制，导致自定义 Base URL 无法通过连通性测试

## 目标

- 支持在管理页面任意新增模型（供应商名称完全自定义）
- 支持删除任意模型（无限制）
- 页面按供应商分组展示，支持折叠/展开
- SSRF 防护改为黑名单机制，屏蔽内网地址，其余均放行

---

## 方案选择

采用**方案 A：String provider + 轻量改造**：

- 数据库 `ai_models.provider` 字段本身已是 `String`，无需迁移
- 主要改动是 TypeScript 类型约束层和新增 CRUD 功能

---

## 架构设计

### 1. 后端类型层变更

**文件：`src/server/modules/models/index.ts`**

```typescript
// 变更前
export type SupportedProvider = "deepseek" | "qwen" | "doubao" | "gemini" | "glm";
const providerSchema = z.enum(["deepseek", "qwen", "doubao", "gemini", "glm"]);

// 变更后
export type SupportedProvider = string;
const providerSchema = z.string().trim().min(1, "供应商不能为空");
```

`ModelListItem.provider` 字段类型从联合类型改为 `string`。

### 2. 新增服务函数

**文件：`src/server/modules/models/index.ts`**（在 `createModelsModule` 内）

```typescript
// 创建模型输入 schema
const createModelInputSchema = z.object({
  provider       : z.string().trim().min(1, "供应商不能为空"),
  name           : z.string().trim().min(1, "名称不能为空"),
  providerModelId: z.string().trim().min(1, "模型标识不能为空"),
  baseUrl        : z.string().trim().min(1, "Base URL 不能为空"),
  apiKey         : z.string().trim().optional()
});

export interface CreateModelInput {
  provider       : string;
  name           : string;
  providerModelId: string;
  baseUrl        : string;
  apiKey?        : string;
}

// 新增函数签名
async function createModel(input: CreateModelInput): Promise<ModelListItem>
async function deleteModel(id: string): Promise<void>
```

创建逻辑：写库，`isEnabled = false`，`isDefault = false`，`aliasKey = null`，API Key 若提供则加密存储。

### 3. Admin Adapters 层

**文件：`src/server/modules/models/admin-adapters.ts`**

新增：

```typescript
export async function createAdminModel(input: CreateModelInput): Promise<ModelListItem>
export async function deleteAdminModel(id: string): Promise<void>
```

### 4. API 路由层

**新文件：`src/app/api/admin/models/route.ts`**（在现有 GET 基础上新增 POST）

```
POST /api/admin/models
Body: { provider, name, providerModelId, baseUrl, apiKey? }
Response: { data: ModelListItem }
```

**新文件：`src/app/api/admin/models/[id]/route.ts`**（在现有 PATCH 基础上新增 DELETE）

```
DELETE /api/admin/models/:id
Response: { data: null }
```

### 5. SSRF 防护改造

**文件：`src/server/modules/models/connectivity.ts`**

删除：`connectivityHostAllowList`（基于 provider 的白名单记录）和 `isAllowedHost` 相关白名单逻辑

新增：`isBlockedHost` 黑名单判断函数

```typescript
// 内网/本地 IP 段黑名单正则
const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^::1$/,
  /^0\.0\.0\.0$/
];

export function isBlockedHost(hostname: string): boolean {
  return BLOCKED_HOSTS.some(pattern => pattern.test(hostname));
}
```

`assertConnectivityBaseUrlAllowed` 签名变更：

```typescript
// 变更前
export function assertConnectivityBaseUrlAllowed(provider: SupportedProvider, baseUrl: string): void

// 变更后
export function assertConnectivityBaseUrlAllowed(baseUrl: string): void
```

调用方（`index.ts` 内 `testModelConnectivity`）同步更新调用参数。

---

## 前端设计

### 6. 前端服务层

**文件：`src/lib/services/models.ts`**

```typescript
export interface AdminModelItem {
  // ...（provider 字段类型从联合类型改为 string）
  provider: string;
}

export interface CreateModelPayload {
  provider       : string;
  name           : string;
  providerModelId: string;
  baseUrl        : string;
  apiKey?        : string;
}

export async function createAdminModel(payload: CreateModelPayload): Promise<AdminModelItem>
export async function deleteAdminModel(id: string): Promise<void>
```

### 7. UI 组件改造

**文件：`src/app/admin/model/_components/model-manager.tsx`**

**分组逻辑：**
```typescript
// 将模型列表按 provider 聚合为 Map
const modelsByProvider = useMemo(() =>
  models.reduce((acc, model) => {
    const group = acc.get(model.provider) ?? [];
    group.push(model);
    acc.set(model.provider, group);
    return acc;
  }, new Map<string, AdminModelItem[]>()),
  [models]
);
```

**折叠状态：**
```typescript
const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());
```

**新增「新增模型」按钮：**
- 位置：页面顶部操作区（PageHeader 区域右侧）
- 触发：`Dialog` 弹出表单

**新增模型 Dialog 组件：**
- 提取为独立组件 `AddModelDialog`（同目录下新文件）
- 字段：供应商（文本输入）、显示名称、模型标识、API Key（可选，带眼睛图标）、Base URL（可选）
- 提交后调用 `createAdminModel`，成功后通过回调更新父组件状态

**删除按钮：**
- 位置：模型卡片标题行右侧（`Trash2` 图标）
- 触发：`AlertDialog` 二次确认（"确认删除此模型？此操作不可撤销"）
- 确认后调用 `deleteAdminModel`，从本地状态 `models` 中过滤掉该 ID

---

## 数据流

```
管理员点击「新增模型」
  → AddModelDialog 填写表单
  → POST /api/admin/models (route handler)
  → createAdminModel service (admin-adapters)
  → createModel (models module)
  → prisma.aiModel.create(...)
  → 返回 ModelListItem
  → 前端追加到 models 状态

管理员点击删除图标
  → AlertDialog 确认
  → DELETE /api/admin/models/[id]
  → deleteAdminModel service
  → deleteModel (models module)
  → prisma.aiModel.delete({ where: { id } })
  → 前端过滤 models 状态

管理员测试连接（自定义 Base URL）
  → POST /api/admin/models/[id]/test
  → testModelConnectivity
  → assertConnectivityBaseUrlAllowed(baseUrl)  // 只做黑名单校验
  → 发起 probe 请求
```

---

## 影响范围

| 文件 | 变更类型 |
|------|----------|
| `src/server/modules/models/index.ts` | 修改类型 + 新增 createModel/deleteModel |
| `src/server/modules/models/connectivity.ts` | 白名单改黑名单，函数签名变更 |
| `src/server/modules/models/admin-adapters.ts` | 新增 createAdminModel/deleteAdminModel |
| `src/app/api/admin/models/route.ts` | 新增 POST 处理器 |
| `src/app/api/admin/models/[id]/route.ts` | 新增 DELETE 处理器 |
| `src/lib/services/models.ts` | provider 类型改 string + 新增两个 API 函数 |
| `src/app/admin/model/_components/model-manager.tsx` | 分组展示 + 删除按钮 |
| `src/app/admin/model/_components/add-model-dialog.tsx` | 新建：新增模型表单 Dialog |

---

## 不在本次范围内

- `aliasKey` 机制和分析阶段策略推荐不变
- 供应商图标/Logo 展示（仍为通用 `Cpu` 图标）
- 模型排序/拖拽
- 批量操作
