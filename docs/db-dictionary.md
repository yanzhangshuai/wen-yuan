# DB Dictionary（数据库字典）

更新时间：2026-03-26  
来源：`prisma/schema.prisma`

## 1. 枚举

| 枚举 | 值 | 含义 |
| --- | --- | --- |
| `NameType` | `NAMED` / `TITLE_ONLY` | 人名类型（有名 vs 仅称号） |
| `RecordSource` | `AI` / `MANUAL` | 记录来源（AI 解析或人工） |
| `AppRole` | `ADMIN` / `VIEWER` | 系统角色 |
| `ProcessingStatus` | `DRAFT` / `VERIFIED` / `REJECTED` | 审核状态 |
| `AnalysisJobStatus` | `QUEUED` / `RUNNING` / `SUCCEEDED` / `FAILED` / `CANCELED` | 解析任务状态 |
| `PersonaType` | `PERSON` / `LOCATION` / `ORGANIZATION` / `CONCEPT` | 图谱实体类型 |
| `BioCategory` | `BIRTH` / `EXAM` / `CAREER` / `TRAVEL` / `SOCIAL` / `DEATH` / `EVENT` | 生平事件分类 |
| `ChapterType` | `PRELUDE` / `CHAPTER` / `POSTLUDE` | 章节类型 |

## 2. 核心模型

## `users`

- 用途：管理员账号与登录认证来源。
- 关键字段：`username`、`email`（均唯一）、`password`（Argon2id hash）、`role`、`is_active`。
- 关键索引：`users_is_active_idx`。

## `ai_models`

- 用途：模型配置中心（BaseURL、Key、启用、默认模型）。
- 关键字段：`provider`、`model_id`、`base_url`、`api_key`、`is_enabled`、`is_default`。
- 关键索引：`ai_models_provider_enabled_idx`。

## `books`

- 用途：书籍主记录与导入源文件信息。
- 关键字段：
- 基本信息：`title`、`author`、`dynasty`、`description`、`cover_url`。
- 解析状态：`status`、`parse_progress`、`parse_stage`、`error_log`。
- 文件元数据：`source_file_key/url/name/mime/size`、`raw_content`。
- 关键索引：`books_deleted_at_idx`。
- 备注：`ai_model_id` 关联 `ai_models.id`。

## `chapters`

- 用途：章节文本与时间轴基础。
- 关键字段：`book_id`、`type`、`no`、`title`、`content`、`is_abstract`。
- 关键约束：`(book_id, type, no)` 联合唯一。

## `personas`

- 用途：全局实体本体（人物/地点/组织/概念）。
- 关键字段：`name`、`type`、`name_type`、`record_source`、`aliases`、`confidence`、`deleted_at`。
- 关键索引：`persona_name_idx`、`persona_deleted_at_idx`。

## `profiles`

- 用途：实体在单本书中的局部档案（标签、小传、讽刺指数、视觉配置）。
- 关键字段：`persona_id`、`book_id`、`local_name`、`local_summary`、`official_title`、`local_tags`、`visual_config`。
- 关键约束：`(persona_id, book_id)` 联合唯一。
- 关键索引：`profiles_book_id_deleted_at_idx`。

## `biography_records`

- 用途：人物生平事件（挂载章节坐标）。
- 关键字段：`persona_id`、`chapter_id`、`chapter_no`、`category`、`event`、`status`、`record_source`。
- 关键索引：`biography_record_chapter_no_idx`、`biography_record_persona_id_idx`、`biography_record_review_query_idx`。

## `mentions`

- 用途：原文提及定位（支持高亮回跳）。
- 关键字段：`persona_id`、`chapter_id`、`raw_text`、`para_index`、`record_source`、`deleted_at`。
- 关键索引：`mentions_chapter_id_idx`、`mention_persona_id_chapter_id_idx`、`mentions_chapter_deleted_at_idx`。

## `relationships`

- 用途：实体关系边。
- 关键字段：`chapter_id`、`source_id`、`target_id`、`type`、`weight`、`evidence`、`status`、`record_source`、`confidence`。
- 关键约束：`relationships_dedup_key`  
`(chapter_id, source_id, target_id, type, record_source)`。
- 关键索引：`relationships_source_id_target_id_idx`、`relationships_review_query_idx`。

## `analysis_jobs`

- 用途：解析任务审计与调度状态。
- 关键字段：`book_id`、`ai_model_id`、`status`、`scope`、`chapter_start/end`、`attempt`、`override_strategy`、`keep_history`、`error_log`。
- 关键索引：`analysis_jobs_book_created_at_idx`、`analysis_jobs_status_created_at_idx`。

## `merge_suggestions`

- 用途：人物消歧合并建议队列。
- 关键字段：`book_id`、`source_persona_id`、`target_persona_id`、`reason`、`confidence`、`evidence_refs`、`status`、`resolved_at`。
- 关键索引：`merge_suggestions_book_status_idx`、`merge_suggestions_source_persona_idx`、`merge_suggestions_target_persona_idx`。

## 3. 生命周期与删除语义

- `books/personas/profiles/mentions/relationships/biography_records` 均采用软删除（`deleted_at`）。
- 业务查询默认过滤 `deleted_at IS NULL`。
- 合并人物时会重定向关联关系，并对冲突边做 `REJECTED + deleted_at` 标记。

