# Wen-Yuan（文渊）MVP 技术方案（完整版）

## 0. 文档信息
- 版本：v1.0
- 日期：2026-03-04
- 对齐产品文档：`.wen-yuan/pro_1.md`
- 定位：个人使用 + 开源协作 + 可扩展到多古典小说

## 1. 架构目标与原则

### 1.1 目标
- 以《儒林外史》跑通完整分析闭环。
- 结论证据可追溯（段落级定位）。
- 保持 MVP 轻量，后续可平滑扩展。

### 1.2 原则
- 准确性优先于“全自动覆盖率”。
- 人工校对优先于模型结论。
- 异步任务优先，避免长请求阻塞。
- 单体可用 + 服务可拆，先简后繁。

### 1.3 非目标
- 不做复杂多租户权限系统。
- 不做超大规模商业高并发架构。
- 不做重型微服务网格。

## 2. 技术选型与 trade-off

### 2.1 应用层
- 方案 A：Next.js 全栈（API + UI）
- 方案 B：Next.js + Python 分析服务（推荐）

推荐 B（MVP 落地）：
- Next.js：页面、业务 API、校对、导出。
- Python Worker：NLP/LLM 抽取流水线。
- 理由：保留现有项目基座，同时充分利用 Python NLP 生态。

### 2.2 队列层
- 方案 A：BullMQ（Node）
- 方案 B：Celery + Redis（推荐）

推荐 B：分析逻辑在 Python 内闭环，任务编排更自然。

### 2.3 数据层
- 主库：PostgreSQL（必须）
- 缓存：Redis（必须）
- 对象存储：MinIO / 本地文件系统（必须）
- 图数据库：Neo4j（可选，v0.3 再评估）

### 2.4 AI 层
- LLM 接入：LiteLLM（统一多模型）
- NLP：HanLP/LTP + 规则字典
- 检索：PostgreSQL FTS + pgvector（可选）

## 3. 系统架构（容器级）

1. `web`（Next.js）
- 作品管理、可视化、校对交互、导出入口。
- 同步 API：轻查询、命令提交。

2. `analysis-worker`（Python）
- 文本清洗、抽取、归一化、冲突检测、校对任务生成。

3. `postgres`
- 业务实体、证据链、审计日志、模型运行记录。

4. `redis`
- 队列、任务状态、短期缓存。

5. `minio/local-storage`
- 原文文件、中间结果、导出文件。

## 4. 模块边界（按功能）

### 4.1 作品工作台模块
- 输入：创建作品、查询作品。
- 输出：作品列表、状态统计。
- 依赖：books、book_versions、analysis_tasks。

### 4.2 导入预处理模块
- 输入：文件/文本。
- 输出：章节、段落、版本记录。
- 依赖：storage、book_versions、chapters、paragraphs。

### 4.3 抽取引擎模块
- 输入：段落文本。
- 输出：characters、relations、events、evidences。
- 依赖：规则库、LLM、model_runs。

### 4.4 图谱与时间轴查询模块
- 输入：过滤条件（章节、阈值、人物 id）。
- 输出：图谱数据与时间轴数据。
- 依赖：relations/events/evidences + 缓存。

### 4.5 校对与审计模块
- 输入：校对动作。
- 输出：更新后的实体 + review_actions。
- 依赖：事务、幂等、防并发冲突。

### 4.6 导出模块
- 输入：作品/版本 + 导出格式。
- 输出：JSON/Markdown/快照文件。
- 依赖：对象存储、异步任务。

## 5. 核心时序设计

### 5.1 链路 A：导入 -> 分析 -> 待校对
1. `POST /books/{id}/import` 创建版本和任务。
2. Worker 读取原文并清洗。
3. 按章节/段落切分并持久化。
4. 人物抽取与别名归一。
5. 关系/事件抽取并绑定证据。
6. 冲突检测并生成 `review_tasks`。
7. 任务成功后更新作品状态 `REVIEW_PENDING`。

失败重试：指数退避 3 次，最终失败写入错误码。

### 5.2 链路 B：图谱查询
1. 前端请求图谱（作品 + 过滤器）。
2. 后端先查缓存，未命中走 DB 查询。
3. 聚合节点/边并附证据摘要。
4. 返回轻量图数据。
5. 前端按需拉证据详情。

降级：查询超时时仅返回高置信边，减少 payload。

### 5.3 链路 C：人工校对与回滚
1. 用户提交校对动作（merge/split/update）。
2. 服务层开启事务更新主实体。
3. 写入 `review_actions` 审计日志。
4. 触发衍生重算（关系、事件参与者）。
5. 清理相关缓存。
6. 回滚时按 action 逆向恢复。

## 6. 数据库模型设计（MVP）

### 6.1 核心表清单
- `books`
- `book_versions`
- `chapters`
- `paragraphs`
- `characters`
- `character_aliases`
- `character_mentions`
- `character_relations`
- `relation_evidences`
- `events`
- `event_participants`
- `event_evidences`
- `review_tasks`
- `review_actions`
- `analysis_tasks`
- `model_runs`

### 6.2 关键字段建议
- `books.status`: 作品状态机
- `book_versions.checksum`: 去重与幂等
- `paragraphs.char_start/char_end`: 证据定位
- `character_relations.confidence`: 展示阈值控制
- `review_actions.before_json/after_json`: 回滚依据
- `model_runs.prompt_version/model_name`: 可追溯 AI 结果来源

### 6.3 索引建议
- `characters(book_version_id, canonical_name)` unique
- `character_mentions(paragraph_id)`
- `character_relations(book_version_id, confidence)`
- `events(book_version_id, chapter_order)`
- `review_tasks(book_version_id, status, priority)`

## 7. Redis 与缓存策略

### 7.1 Key 设计
- `book:{bookId}:summary`
- `graph:{bookVersionId}:{filterHash}`
- `timeline:{bookVersionId}:{characterId}:{filterHash}`
- `task:{taskId}:progress`

### 7.2 TTL 建议
- 作品摘要：60s
- 图谱/时间轴：120s
- 任务进度：24h

### 7.3 一致性策略
- 校对成功后，删除图谱和时间轴相关缓存。
- 分析完成后，刷新作品摘要缓存。

## 8. API 合同（MVP 最小集）

### 8.1 统一响应
```json
{
  "success": true,
  "code": "OK",
  "message": "ok",
  "data": {},
  "meta": {}
}
```

### 8.2 接口列表（核心 24 个）
1. `POST /api/v1/books`
2. `GET /api/v1/books`
3. `GET /api/v1/books/{bookId}`
4. `PATCH /api/v1/books/{bookId}`
5. `POST /api/v1/books/{bookId}/import`
6. `GET /api/v1/books/{bookId}/versions`
7. `POST /api/v1/books/{bookId}/analyze`
8. `GET /api/v1/tasks/{taskId}`
9. `GET /api/v1/books/{bookId}/characters`
10. `GET /api/v1/books/{bookId}/characters/{characterId}`
11. `GET /api/v1/books/{bookId}/graph`
12. `GET /api/v1/books/{bookId}/relations`
13. `GET /api/v1/books/{bookId}/events`
14. `GET /api/v1/books/{bookId}/timeline`
15. `GET /api/v1/evidences/{evidenceId}`
16. `GET /api/v1/review/tasks`
17. `POST /api/v1/review/characters/merge`
18. `POST /api/v1/review/characters/split`
19. `POST /api/v1/review/characters/alias`
20. `POST /api/v1/review/relations/update`
21. `POST /api/v1/review/events/update`
22. `POST /api/v1/review/actions/{actionId}/rollback`
23. `POST /api/v1/books/{bookId}/export`
24. `GET /api/v1/exports/{exportId}`

## 9. AI 抽取工程设计

### 9.1 Pipeline
1. 文本切分（章 -> 段 -> 滑窗）
2. 候选人物召回（规则 + NER）
3. 别名归一（称谓/字/号映射）
4. 关系候选召回（共现 + 动词触发）
5. LLM 结构化判定（JSON Schema）
6. 事件抽取与参与人绑定
7. 冲突检测（同名异人/关系互斥/时间冲突）
8. 结果落库 + 生成 review_tasks

### 9.2 幻觉抑制
- 无证据 -> 不得进入 `VERIFIED`
- 低置信 -> `DRAFT + review_task`
- 冲突结论 -> 打标并进入人工队列

### 9.3 Prompt 管理
- Prompt 按版本号维护。
- model_runs 记录 prompt_version。
- 支持灰度切换和快速回滚。

## 10. 异步任务编排

### 10.1 任务类型
- `INGEST`
- `EXTRACT_CHARACTER`
- `EXTRACT_RELATION`
- `EXTRACT_EVENT`
- `GENERATE_REVIEW_TASK`
- `EXPORT_REPORT`

### 10.2 状态机
`PENDING -> RUNNING -> SUCCESS`
`RUNNING -> RETRY -> RUNNING`
`RUNNING/RETRY -> FAILED`
`PENDING/RUNNING -> CANCELLED`

### 10.3 幂等键
`book_version_id + task_type + checksum`

### 10.4 死信策略
- 超过最大重试进入 DLQ。
- 触发告警并提供人工重跑入口。

## 11. 安全与审计
- MVP 可用轻量 JWT。
- 所有校对动作保留审计轨迹。
- 日志脱敏（token/key/隐私文本截断）。
- API 限流：防误操作批量提交。

## 12. 可观测性
- 系统指标：CPU、内存、队列积压。
- 业务指标：导入成功率、校对完成率、证据绑定率。
- 模型指标：token 成本、平均延迟、失败率。
- 日志：JSON 结构化 + trace_id 贯穿。

## 13. 部署与运维

### 13.1 环境
- `dev`：本地开发
- `staging`：联调与验收
- `prod`：稳定运行

### 13.2 部署方案（MVP）
- Docker Compose：`web + worker + postgres + redis + minio`
- Nginx/Caddy 反向代理

### 13.3 备份
- PostgreSQL 每日逻辑备份
- 导出文件按版本归档

## 14. 实施计划

### 阶段一（2~4 周，v0.1）
- 作品工作台 + 导入切分
- 人物抽取 + 基础关系图
- 基础校对（人物合并、关系修正）

### 阶段二（v0.2）
- 事件抽取 + 时间轴
- 证据展示增强
- 导出功能

### 阶段三（v0.3）
- 多作品与对比
- 可选 Neo4j 增强
- 开源贡献流程完善

## 15. 从《儒林外史》到多作品扩展
- 当前按 `book -> version` 模型支持多作品。
- 扩展时新增 `project` 维度即可，不破坏现有 API。
- 作品级规则库可配置化（不同小说称谓/关系词典）。

