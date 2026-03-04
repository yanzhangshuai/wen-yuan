# Wen-Yuan TDD（MVP 工程实现方案）

## 0. 文档信息
- 版本：v1.0（MVP 工程化版）
- 更新时间：2026-03-04
- 关联文档：`.wen-yuan/PRD.md`
- 实施目标：可开发、可上线、可维护

## 1. 架构目标与约束

### 1.1 目标
- 跑通《儒林外史》单作品闭环：导入 -> 抽取 -> 校对 -> 可视化 -> 导出。
- 保证证据可追溯：每条关系/事件都能回链原文段落。
- 支持后续多作品扩展，不在 MVP 引入重型企业能力。

### 1.2 约束
- 单用户/小团队使用优先。
- 开源部署优先（Docker Compose）。
- 成本可控优先于极限性能。

## 2. 技术选型与取舍

### 2.1 前后端架构
- 方案 A：Next.js 全栈（App Router + Route Handler）
  - 优点：复用现有代码，交付快，部署简单。
  - 缺点：Python NLP 生态接入相对弱。
- 方案 B：Next.js 前端 + FastAPI 分析服务（推荐）
  - 优点：NLP/LLM 工具链完整，分析任务解耦。
  - 缺点：多服务运维复杂度更高。

**推荐**：MVP 采用 B 的轻量版。
- Web/API：Next.js（用户交互、管理接口）。
- Analysis Worker：Python（FastAPI 或 Celery Worker）处理抽取任务。
- 理由：兼顾现有代码基础和 AI 能力扩展。

### 2.2 任务队列
- 方案 A：BullMQ（Node 生态）
- 方案 B：Celery + Redis（Python 生态，推荐）

**推荐**：Celery + Redis。
- 抽取链路主要在 Python 执行，避免跨语言调度胶水层。

### 2.3 检索与图能力
- 方案 A：PostgreSQL FTS + pgvector（推荐）
- 方案 B：Elasticsearch + 向量库（过重）

**推荐**：A，MVP 成本低且运维简单。

### 2.4 图数据库
- 方案 A：仅 PostgreSQL 存边（推荐）
- 方案 B：引入 Neo4j

**推荐**：MVP 使用 A；v0.3 视复杂查询再引入 Neo4j。

## 3. 系统容器与模块边界

### 3.1 容器划分
1. `web`（Next.js）
- 页面、API、校对操作入口、导出入口。

2. `analysis-worker`（Python）
- 文本清洗、NER、关系/事件抽取、归一化、置信度计算。

3. `postgres`
- 业务主库、证据链、审计日志。

4. `redis`
- 队列、任务状态缓存、热点缓存。

5. `minio/local-storage`
- 原始文本、处理中间文件、导出文件。

### 3.2 模块职责
- `Book Workspace`：作品与版本管理。
- `Ingestion`：上传、清洗、切分、入库。
- `Extraction Engine`：人物/关系/事件抽取。
- `Evidence Binder`：结论与证据绑定。
- `Review Center`：人工修正、回滚、审计。
- `Graph & Timeline`：图谱与时间轴查询接口。
- `Export`：JSON/Markdown/快照导出。

## 4. 核心时序（MVP）

### 4.1 导入与分析链路
1. `POST /books/import` 上传文本，生成 `book_version`。
2. Ingestion Worker 清洗文本并切章节/段落。
3. 生成 `analysis_task(type=INGEST)`，状态 `PENDING -> RUNNING`。
4. 抽取人物/别名/提及，写入 `characters` 等表。
5. 抽取关系与事件，写入证据绑定表。
6. 生成 `review_tasks`（低置信或冲突数据）。
7. 任务完成，作品状态进入 `待校对`。

失败处理：
- 失败任务进入 `RETRY`（指数退避 3 次），超过上限进 `FAILED`。
- `FAILED` 写入错误码与可读错误摘要。

### 4.2 查询链路（图谱/时间轴）
1. 用户打开作品详情页。
2. 前端请求图谱或时间轴接口。
3. 后端按章节范围和置信阈值过滤关系/事件。
4. 返回对象时附带 `evidence_ids`。
5. 前端按需拉取证据详情并展示原文片段。

### 4.3 人工校对链路
1. 用户提交校对动作（merge/split/update/delete）。
2. 后端事务写入：目标对象更新 + `review_actions`。
3. 触发派生重算（例如人物合并后关系重挂接）。
4. 回滚时根据 `before_json` 反向恢复。

## 5. 数据模型（MVP）

## 5.1 核心实体关系
- 一本 `book` 有多个 `book_versions`。
- 一个版本有多个 `chapters`，章节有多个 `paragraphs`。
- `characters` 属于 `book_version`。
- `character_relations` 与 `events` 必须关联证据表。
- 人工校对动作写入 `review_actions`，可回滚。

### 5.2 PostgreSQL DDL（核心节选）
```sql
CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT,
  dynasty TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'NOT_IMPORTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE book_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  source_type TEXT NOT NULL,
  source_path TEXT,
  checksum TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IMPORTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_id, version_no),
  UNIQUE (book_id, checksum)
);

CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_version_id UUID NOT NULL REFERENCES book_versions(id) ON DELETE CASCADE,
  chapter_no INT NOT NULL,
  chapter_title TEXT NOT NULL,
  raw_heading TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_version_id, chapter_no)
);

CREATE TABLE paragraphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  para_no INT NOT NULL,
  content TEXT NOT NULL,
  char_start INT NOT NULL,
  char_end INT NOT NULL,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, para_no)
);
CREATE INDEX idx_paragraphs_hash ON paragraphs(hash);

CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_version_id UUID NOT NULL REFERENCES book_versions(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  gender TEXT,
  identity_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_version_id, canonical_name)
);

CREATE TABLE character_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_type TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (character_id, alias)
);

CREATE TABLE character_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  paragraph_id UUID NOT NULL REFERENCES paragraphs(id) ON DELETE CASCADE,
  mention_text TEXT NOT NULL,
  offset_start INT NOT NULL,
  offset_end INT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_character_mentions_para ON character_mentions(paragraph_id);

CREATE TABLE character_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_version_id UUID NOT NULL REFERENCES book_versions(id) ON DELETE CASCADE,
  source_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  target_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'DIRECTED',
  strength NUMERIC(5,4) NOT NULL DEFAULT 0.0,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.0,
  first_chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_relations_book_ver ON character_relations(book_version_id);

CREATE TABLE relation_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relation_id UUID NOT NULL REFERENCES character_relations(id) ON DELETE CASCADE,
  paragraph_id UUID NOT NULL REFERENCES paragraphs(id) ON DELETE CASCADE,
  evidence_text TEXT NOT NULL,
  score NUMERIC(5,4) NOT NULL DEFAULT 0.0,
  llm_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_version_id UUID NOT NULL REFERENCES book_versions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL,
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  chapter_order INT NOT NULL,
  temporal_hint TEXT,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0.0,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  role_in_event TEXT,
  UNIQUE (event_id, character_id)
);

CREATE TABLE event_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  paragraph_id UUID NOT NULL REFERENCES paragraphs(id) ON DELETE CASCADE,
  evidence_text TEXT NOT NULL,
  score NUMERIC(5,4) NOT NULL DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE review_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_version_id UUID NOT NULL REFERENCES book_versions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE review_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_version_id UUID NOT NULL REFERENCES book_versions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID,
  action_type TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  reason TEXT,
  operator TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE model_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_version_id UUID NOT NULL REFERENCES book_versions(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 6. 缓存与对象存储

### 6.1 Redis Key 约定
- `book:{bookId}:status`：作品状态缓存（TTL 30s）。
- `graph:{bookVersionId}:{threshold}`：图谱查询缓存（TTL 120s）。
- `timeline:{bookVersionId}:{characterId}`：时间轴缓存（TTL 120s）。
- `task:{taskId}:progress`：异步任务进度（TTL 24h）。

一致性策略：
- 校对动作成功后主动删除对应 `graph/timeline` 缓存。

### 6.2 对象存储目录
- `raw/{bookId}/{versionNo}/source.txt`
- `processed/{bookId}/{versionNo}/cleaned.json`
- `exports/{bookId}/{versionNo}/report-<timestamp>.md`

## 7. API 设计（MVP）

### 7.1 统一响应结构
```json
{
  "success": true,
  "code": "OK",
  "message": "ok",
  "data": {},
  "meta": {}
}
```

### 7.2 核心接口（示例）
1. `POST /api/v1/books` 创建作品。
2. `GET /api/v1/books` 作品列表（搜索/过滤/分页）。
3. `GET /api/v1/books/{bookId}` 作品详情。
4. `POST /api/v1/books/{bookId}/import` 导入文本。
5. `GET /api/v1/books/{bookId}/versions` 版本列表。
6. `POST /api/v1/books/{bookId}/analyze` 启动分析。
7. `GET /api/v1/tasks/{taskId}` 查询任务进度。
8. `GET /api/v1/books/{bookId}/characters` 人物列表。
9. `GET /api/v1/books/{bookId}/graph` 人物关系图。
10. `GET /api/v1/books/{bookId}/relations` 关系明细。
11. `GET /api/v1/books/{bookId}/events` 事件列表。
12. `GET /api/v1/books/{bookId}/timeline` 时间轴。
13. `GET /api/v1/evidences/{evidenceId}` 证据详情。
14. `POST /api/v1/review/characters/merge` 人物合并。
15. `POST /api/v1/review/characters/split` 人物拆分。
16. `POST /api/v1/review/relations/update` 关系修正。
17. `POST /api/v1/review/events/update` 事件修正。
18. `POST /api/v1/review/actions/{actionId}/rollback` 回滚。
19. `GET /api/v1/review/tasks` 待校对任务列表。
20. `GET /api/v1/books/{bookId}/export` 导出结果。

## 8. AI 抽取与 RAG 策略

### 8.1 文本切分
- 一级：章节切分。
- 二级：段落切分。
- 三级：滑窗（上下文窗口 2~4 段）供模型判定。

### 8.2 抽取策略
1. 规则召回：称谓词典、官职词典、共现触发器。
2. 轻模型筛选：过滤噪音候选。
3. 大模型结构化判定：输出 JSON Schema。
4. 冲突消解：同名异人、别名聚合、置信度重算。

### 8.3 幻觉抑制
- 所有输出必须附 `evidence_ids`。
- 无证据或证据冲突时降级为 `DRAFT` 并生成 `review_task`。
- 低于阈值（如 0.65）不进入默认图谱展示。

## 9. 异步任务与状态机

### 9.1 任务状态机
`PENDING -> RUNNING -> SUCCESS`
`RUNNING -> RETRY -> RUNNING`
`RUNNING/RETRY -> FAILED`
`PENDING/RUNNING -> CANCELLED`

### 9.2 重试策略
- 指数退避：30s, 2m, 10m。
- 最大重试：3 次。
- 超过上限写入死信队列并生成告警。

### 9.3 幂等策略
- 幂等键：`book_version_id + task_type + checksum`。
- 同幂等键重复提交直接返回已有任务。

## 10. 安全与运维

### 10.1 安全
- MVP 鉴权：JWT（可单用户弱化）。
- 审计：所有校对动作写 `review_actions`。
- 日志脱敏：token、密钥、原文隐私字段不落明文日志。

### 10.2 可观测性
- 指标：任务成功率、平均耗时、队列积压、token 成本。
- 日志：结构化 JSON，统一 trace_id。
- 告警：失败率阈值、积压阈值、成本异常阈值。

### 10.3 部署
- 本地/小规模：Docker Compose（web + worker + postgres + redis + minio）。
- 反向代理：Nginx/Caddy。
- 备份：PostgreSQL 每日备份，对象存储按版本留档。

## 11. 从单作品到多作品扩展策略
- MVP（当前）：单作品优先，但数据结构采用 `book -> version`。
- v0.3：新增 `project` 维度，按项目管理多作品。
- 保持 API 向后兼容：`/books/*` 不破坏；新增 `/projects/{id}/books/*`。

