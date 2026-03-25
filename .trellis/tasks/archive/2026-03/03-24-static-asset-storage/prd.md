# brainstorm: 静态资源存储方案

## Goal

为文渊新增统一的静态资源存储方案，用来承载导入的原始书籍文件、封面图和后续图片资源；当前阶段优先满足个人项目的低运维成本与易调试，后续保留切换阿里云 OSS 的扩展路径。

## What I already know

* 当前 `Book` 已有 `coverUrl`，但还没有正式定义“原始书籍文件存到哪里”的产品口径。
* 当前 `Book.rawContent` 仍存数据库，适合章节切分与解析链路，但不等于静态资源存储方案。
* 现有 Provider 组织方式已经存在于 `src/server/providers/ai/*`，适合复用为 `src/server/providers/storage/*`。
* 当前项目是个人项目，默认优先级应是“少服务、少运维、少配置”。
* 用户明确希望：
  * 书籍、图片等静态资源保存到统一位置
  * 当前优先本地或本地 S3 服务，由我给出推荐
  * 后续可切到阿里云 OSS
  * 数据库增加链接字段

## Assumptions (temporary)

* M0 不引入单独的资源管理后台页面，存储配置先走环境变量。
* M0 不在数据库中保存二进制文件，数据库只保存 URL / key / 元数据。
* M0 的导入原始 `.txt` 以“服务端内部可追溯资源”为主，但必须支持站内可控链接访问（用于原文阅读、证据回跳与调试）。
* M0 先不新建通用 `assets` 表，而是在 `Book` 上补足资源字段；当后续出现“一书多图 / 多附件”时，再升级为通用资源表。

## Requirements

* 新增统一静态资源抽象层，目录位于 `src/server/providers/storage/`。
* 抽象层接口风格与 `src/server/providers/ai/` 保持一致，支持 provider 路由与未来扩展。
* M0 默认 Provider 采用本地文件系统存储。
* M0 为未来保留 `oss` Provider 扩展位，不把存储逻辑写死在业务模块内。
* 导入的原始书籍文件必须经过 Storage Provider 保存，而不是仅存在数据库字段里。
* 书籍封面图与后续图片资源使用同一套 Storage Provider 抽象。
* 数据库至少新增书籍原始文件链接字段；工程上同时保留对象 key 和基础元信息，避免后续迁移 OSS 时失真。
* 业务模块只依赖统一存储接口，不直接操作本地路径、MinIO SDK 或 OSS SDK。
* 本地开发与生产部署都必须能通过环境变量切换 provider。
* 本地存储必须支持“通过链接访问”，且链接访问不能暴露服务器绝对路径。

## Acceptance Criteria

* [ ] 主 PRD 中正式定义“静态资源存储”能力、当前推荐方案与未来扩展路径。
* [ ] 主 PRD 中明确 `Book` 新增字段口径：至少包含 `sourceFileUrl`，并补充 `sourceFileKey` 等迁移所需字段。
* [ ] 开发任务清单中补充 `src/server/providers/storage/`、本地存储实现和书籍上传接入任务。
* [ ] Ticket 文档中补充可单独开发的存储层 ticket，且依赖关系清晰。
* [ ] 文档明确为什么当前不推荐默认启用本地 S3 服务。
* [ ] 文档明确后续切 OSS 时不需要重写业务模块，只需新增 Provider 与配置。
* [ ] 文档明确本地文件如何通过站内链接访问（推荐统一资源访问路由）。

## Definition of Done (team quality bar)

* 文档已同步到主 PRD、开发任务清单和 ticket 拆解
* 推荐方案、边界与后续演进路径明确
* 数据模型变更点、目录落位与实施阶段已写清
* 未删除现有正式需求，仅做补充与执行口径收敛

## Out of Scope (explicit)

* 当前轮次不直接实现 `src/server/providers/storage/*` 代码
* 当前轮次不接入阿里云 OSS SDK
* 当前轮次不增加独立的“资源管理页”或 CDN 配置页
* 当前轮次不把所有图片关系都抽象成单独 `assets` 表

## Research Notes

### What similar tools do

* 个人项目或单机部署项目，首版通常优先使用本地文件系统，先把上传、删除、迁移口径稳定下来。
* 当项目需要“对象存储语义一致性”或多环境对齐时，常见做法是抽象出统一 storage provider，再分别实现 local / s3 / oss。
* 只有在一开始就明确多机部署、签名 URL、外网桶策略时，才值得默认上 MinIO 或云 OSS。

### Constraints from our repo/project

* 代码库已经有 `providers/ai` 模式，适合复制到存储层。
* 当前项目还在 M0 阶段，登录、导入、图谱、审核主链路优先级高于基础设施“拟真化”。
* 书籍原始文本本身已经有 `rawContent` / `Chapter.content` 读写链路，因此对象存储更多承担“原始文件保留、封面图统一管理、未来图片资源扩展”的职责。

### Feasible approaches here

**Approach A: 本地文件系统 + Storage Provider 抽象** (Recommended)

* How it works:
  * 默认 `provider=local`
  * 文件写入如 `storage/books/<bookId>/source/...`、`storage/books/<bookId>/covers/...`
  * 数据库保存 `sourceFileUrl`、`sourceFileKey`、`sourceFileMime`、`sourceFileSize`
  * 后续新增 `oss` Provider 时复用相同接口
* Pros:
  * 最省运维，个人项目最容易落地
  * 调试和排障最直接
  * 先把业务链路跑通，不被对象存储服务配置阻塞
* Cons:
  * 单机路径依赖明显
  * 后续迁移云存储需要一次对象搬迁

**Approach B: 本地直接跑 S3 兼容服务（如 MinIO）**

* How it works:
  * 默认本地启动对象存储服务
  * 应用层一开始就按对象存储方式上传、读取、删除
* Pros:
  * 本地与未来云对象存储心智更接近
  * 更早拥有 bucket / object / URL 的完整模型
* Cons:
  * 对个人项目来说增加一层运维负担
  * 本阶段会把时间花在服务启动、权限、端口与配置一致性上

**Approach C: 现在就直接接阿里云 OSS**

* How it works:
  * 开发和运行都依赖阿里云 OSS 配置
* Pros:
  * 提前走到最终部署形态
* Cons:
  * 首版开发门槛高
  * 需要更早处理云配置、凭证、安全、成本与桶策略

## Technical Approach

当前推荐采用 **Approach A：本地文件系统 + Storage Provider 抽象**。

### Provider 目录建议

```text
src/server/providers/storage/
  index.ts
  localStorageProvider.ts
  ossStorageProvider.ts        # 先定义占位或接口约束，后续实现
  storage.types.ts
  storage.utils.ts
  index.test.ts
```

### 抽象接口建议

```ts
interface StorageProviderClient {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  deleteObject(key: string): Promise<void>;
  getObjectUrl(key: string): Promise<string>;
}
```

建议返回结构：

* `key`: provider 内部对象标识，作为删除、迁移、重建 URL 的稳定依据
* `url`: 当前可访问链接或内部访问链接
* `mimeType`
* `size`

### 数据模型建议

M0 先不引入通用 `assets` 表，先在 `Book` 上补齐：

* `source_file_url String?`
* `source_file_key String?`
* `source_file_name String?`
* `source_file_mime String?`
* `source_file_size Int?`

同时复用已有：

* `cover_url String?`

说明：

* `source_file_url` 满足“数据库增加链接字段”的产品诉求。
* `source_file_key` 是后续切 OSS、重建 URL、删除对象、批量迁移时真正稳定的主键。
* `raw_content` 继续保留，用于章节切分、重解析和服务端兜底，不与对象存储冲突。

### 路径规划建议

本地 provider 建议写入：

```text
storage/
  books/<bookId>/source/<timestamp>-<slug>.txt
  books/<bookId>/cover/<timestamp>-cover.png
  books/<bookId>/images/<timestamp>-<name>.webp
```

### 本地链接访问策略（回答“本地能不能通过链接访问”）

可以，推荐走**统一资源访问路由**，不要直接暴露物理路径。

建议方式：

* 数据库保存 `sourceFileKey`（稳定主键）和 `sourceFileUrl`（可访问链接）
* 本地访问 URL 统一形如：
  * `/api/assets/<key>`
* Route Handler 内部通过 Storage Provider 读取对象并返回流
* 可在 Route Handler 增加权限、限流、日志脱敏和下载头控制

这样做的好处：

* 本地可直接访问链接，满足前台使用
* 不泄露服务器绝对路径
* 后续切 OSS 时，URL 规则与业务接口可以保持兼容

### 配置建议

M0 先走环境变量：

* `STORAGE_PROVIDER=local`
* `STORAGE_LOCAL_ROOT=./storage`
* `STORAGE_PUBLIC_BASE_URL=http://localhost:3000`

为后续 OSS 预留：

* `OSS_ENDPOINT`
* `OSS_BUCKET`
* `OSS_ACCESS_KEY_ID`
* `OSS_ACCESS_KEY_SECRET`
* `OSS_REGION`
* `OSS_PUBLIC_BASE_URL`

## Decision (ADR-lite)

**Context**

项目当前是个人项目，首先要优先打通“导入 -> 解析 -> 图谱 -> 审核”主闭环；静态资源需要统一归档，但不值得在 M0 默认引入额外对象存储服务运维负担。

**Decision**

采用“本地文件系统作为默认存储后端 + `src/server/providers/storage/` 统一抽象层 + 后续新增 `oss` Provider”的路线。

**Consequences**

* 当前开发速度更快，问题更容易排查。
* 业务代码不会直接耦合某一家对象存储 SDK。
* 后续迁移 OSS 时主要成本集中在 provider 实现与对象搬迁，不需要重写导入、封面、图片等业务模块。
* 如果后面图片类型明显变多，再把 `Book` 上的 URL 字段升级为通用 `assets` 表。

## Technical Notes

* 参考现有 Provider 模式：`src/server/providers/ai/index.ts`
* 当前主 PRD：`.trellis/tasks/03-23-wen-yuan-prd/prd.md`
* 当前开发任务清单：`.trellis/tasks/03-24-dev-task-checklist/prd.md`
* 当前 Ticket 文档：`.trellis/tasks/03-24-dev-ticket-breakdown/prd.md`
