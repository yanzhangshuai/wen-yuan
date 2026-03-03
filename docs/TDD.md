## 1. 系统架构全景 (System Architecture)
系统采用 前后端解耦的混合渲染架构，针对长耗时任务（AI 解析）和高频交互（3D 渲染）进行了专门的工程化拆解。

### 1.1 核心技术栈 (Technology Stack)
* 前端/后端: Next.js 16 (App Router) —— 一站式解决路由与 API。
* 数据库: PostgreSQL (Prisma 7) —— 既存关系数据，也存 AI 解析状态。
* 3D 渲染: react-force-graph-3d —— 开箱即用的 3D 拓扑组件。
* AI 调度: 直接在 Server Actions 中运行（支持长连接或 Vercel Background Functions）。
### 2. 数据库深度建模 (High-Performance Modeling)
严格遵循 snake_case 命名与 复数表名。

#### 2.1 关系型建模 (PostgreSQL)
```typescript
// --- 枚举定义 (业务逻辑分类) ---

enum ProcessingStatus {
  DRAFT     // AI 初步提取，待人工审核
  VERIFIED  // 已人工核准，正式入库
  REJECTED  // 噪音数据或错误识别

  @@map("processing_status")
}

enum PersonaType {
  PERSON       // 人物
  LOCATION     // 地点（州县、官署、名胜）
  ORGANIZATION // 组织（家族、帮派、学院）
  CONCEPT      // 关键概念/物件（如：严监生的两根灯草）

  @@map("persona_type")
}

enum BioCategory {
  BIRTH   // 出生
  EXAM    // 科举/晋升
  CAREER  // 官职变动/职业生涯
  TRAVEL  // 游历/搬迁
  SOCIAL  // 重大社交
  DEATH   // 卒
  EVENT   // 普通重要情节

  @@map("bio_category")
}

enum ChapterType {
  PRELUDE  // 楔子 / 序幕
  CHAPTER  // 正文回目
  POSTLUDE // 后记 / 尾声

  @@map("chapter_type")
}

// --- 核心模型 ---

/// @db.remark: 书籍库。系统的顶层容器。
model Book {
  id          String   @id @default(uuid()) @db.Uuid
  title       String   // 书名
  author      String?  // 作者
  dynasty     String?  // 背景朝代
  description String?  @db.Text
  cover_url   String?  @map("cover_url") // 3D 看板所需的封面图
  // PENDING (初始), PROCESSING (解析中), COMPLETED (完成), ERROR (失败)
  status      String   @default("PENDING") 
  error_log   String?  @db.Text // 如果解析失败，直接存入数据库

  chapters    Chapter[]
  profiles    Profile[] 
  created_at  DateTime @default(now()) @map("created_at")

  @@map("books") 
}

/// @db.remark: 章节回目。时间轴的物理基石。
model Chapter {
  id          String      @id @default(uuid()) @db.Uuid
  book_id     String      @map("book_id") @db.Uuid
  type        ChapterType @default(CHAPTER)
  no          Int         // 章节序号
  unit        String      @default("回")
  no_text     String?     @map("no_text") 
  title       String      // 章节名
  content     String      @db.Text // 章节原文
  is_abstract Boolean     @default(false) @map("is_abstract")

  book        Book              @relation(fields: [book_id], references: [id])
  mentions    Mention[]
  biographies BiographyRecord[]
  relations   Relationship[]

  @@unique([book_id, type, no], map: "chapter_book_type_no_key")
  @@map("chapters")
}

/// @db.remark: 全局角色本体。支持跨书籍关联。
model Persona {
  id          String      @id @default(uuid()) @db.Uuid
  name        String      // 全局标准名
  type        PersonaType @default(PERSON)
  gender      String?

  birth_year  String?     @map("birth_year")
  death_year  String?     @map("death_year")
  global_tags String[]    @map("global_tags")

  profiles    Profile[]
  mentions    Mention[]
  biographies BiographyRecord[]
  
  // 建立双向关系关联，方便 3D 图谱从 Persona 直接出发查询
  source_rels Relationship[]  @relation("SourcePersona")
  target_rels Relationship[]  @relation("TargetPersona")

  @@index([name], map: "persona_name_idx")
  @@map("personas")
}

/// @db.remark: 角色书中档案。记录该角色在特定书中的特有属性。
model Profile {
  id             String  @id @default(uuid()) @db.Uuid
  persona_id     String  @map("persona_id") @db.Uuid
  book_id        String  @map("book_id") @db.Uuid

  local_name     String  @map("local_name")
  local_summary  String? @map("local_summary") @db.Text 
  irony_index    Float   @default(0) @map("irony_index") 
  moral_tier     String? @map("moral_tier")
  
  // 3D 视觉配置缓存：存储节点颜色、发光度、初始坐标建议等
  visual_config  Json?   @map("visual_config")

  persona        Persona @relation(fields: [persona_id], references: [id])
  book           Book    @relation(fields: [book_id], references: [id])

  @@unique([persona_id, book_id], map: "profile_persona_id_book_id_key")
  @@map("profiles")
}

/// @db.remark: 履历记录表。记录生平变迁。
model BiographyRecord {
  id           String      @id @default(uuid()) @db.Uuid
  persona_id   String      @map("persona_id") @db.Uuid
  chapter_id   String      @map("chapter_id") @db.Uuid
  chapter_no   Int         @map("chapter_no") 

  category     BioCategory @default(EVENT)
  title        String?     // 当时的职位/身份
  location     String?     // 发生的地理位置
  event        String      @db.Text
  virtual_year String?     @map("virtual_year")

  irony_note   String?     @map("irony_note") @db.Text
  status       ProcessingStatus @default(DRAFT)

  persona      Persona     @relation(fields: [persona_id], references: [id])
  chapter      Chapter     @relation(fields: [chapter_id], references: [id])

  @@index([chapter_no])
  @@index([persona_id])
  @@map("biography_records")
}

/// @db.remark: 原文提及记录。
model Mention {
  id           String  @id @default(uuid()) @db.Uuid
  persona_id   String  @map("persona_id") @db.Uuid
  chapter_id   String  @map("chapter_id") @db.Uuid

  raw_text     String  @map("raw_text") 
  summary      String? 
  para_index   Int?    @map("para_index") 

  persona      Persona @relation(fields: [persona_id], references: [id])
  chapter      Chapter @relation(fields: [chapter_id], references: [id])

  @@index([chapter_id])
  @@index([persona_id, chapter_id])
  @@map("mentions")
}

/// @db.remark: 动态关系表。
model Relationship {
  id           String  @id @default(uuid()) @db.Uuid
  chapter_id   String  @map("chapter_id") @db.Uuid
  source_id    String  @map("source_id") @db.Uuid
  target_id    String  @map("target_id") @db.Uuid

  type         String  // 关系类型
  weight       Float   @default(1.0)
  description  String? @db.Text
  status       ProcessingStatus @default(DRAFT)

  chapter      Chapter @relation(fields: [chapter_id], references: [id])
  source       Persona @relation("SourcePersona", fields: [source_id], references: [id])
  target       Persona @relation("TargetPersona", fields: [target_id], references: [id])

  @@index([source_id, target_id])
  @@map("relationships")
}
```

#### 2.2 图关系建模 (Neo4j Cypher 结构)
```cypher
// 核心节点与关系定义
(p:Persona {id: "uuid", name: "范进"})
-[:RELATION {type: "FRIEND", weight: 0.8, book_id: "book_uuid"}]->
(p2:Persona {id: "uuid", name: "张静斋"})
```

### 3. 高性能工程化方案 (Engineering Specs)

#### 3.1 异步 AI 解析流水线 (Analysis Pipeline)
为了保证解析千万字著作时不阻塞 UI，采用 生产者-消费者模型：
* 文件分片: Next.js 将上传的书籍切分为 100KB 的 chunks 存入临时 Bucket。
* 异步队列: 使用 QStash 发起延迟 Webhook，由独立的解析逻辑处理。
* 流式反馈: 后端通过 Server-Sent Events (SSE) 向前端推送解析进度（如：“正在识别第 5 回...”）。
* 模型熔断: 预设 Gemini -> DeepSeek -> GPT-4o 的降级链路，确保 API 超时时解析不中断。

#### 3.2 3D 渲染性能优化 (GPU Acceleration)
* 数据压缩: 前端请求图谱数据时，后端执行 拓扑剪枝，仅返回当前视距内的节点。
* Web Worker 物理模拟: 使用独立的 Worker 线程运行 d3-force-3d 布局算法，防止计算节点坐标时页面卡死（Frame Drop）。
* Glow & Bloom Post-processing:利用 UnrealBloomPass 实现节点辉光。通过 Raycaster 优化鼠标拾取精度，确保 3D 空间中准确点击小球。

### 4. 极致工程化：校对系统解决方案

#### 4.1 双向同步校对 (Bidirectional Sync)
设计思路：我们不推荐纯管理页，而是采用 “空间编辑模式”。
* 操作流:用户在 3D 看板右键点击节点，通过 Zustand 唤起浮动编辑表单。修改后的数据通过 Optimistic Updates (乐观更新) 瞬间改变 3D 状态，同时发起 Server Action 写入数据库。
* 冲突检测: 如果 AI 正在解析该书，人工编辑会暂时加锁，并在数据库记录 last_edited_by。

### 5. 性能指标监测 (Observability)

| 场景 | 性能目标 | 监测工具 |
| --- | --- | --- |
| 首屏加载 | LCP < 1.5s | Vercel Speed Insights |
| 3D 交互 | 保持 60 FPS | Chrome DevTools (FPS Meter) |
| 图查询 | 3 层深度查询 < 100ms | Neo4j Query Log |
| AI 吞吐 | 并发解析章节 > 10 / min | Sentry (Tracing) |

### 🎨 视觉交互规范 (Visual Identity)

#### 5.1 亮/暗模式 (Dual Theme)
* Dark (Default): #020617 背景。连线使用 additive blending 材质，赋予节点一种“恒星”感。
* Light (Scholarly): 使用仿宣纸纹理。连线变为淡墨色，节点为朱砂印章红色。

#### 5.2 跑马灯与流光 (Glow FX)
* 按钮: border-image 使用 conic-gradient 配合 framer-motion 实现旋转流光。
* 关系路径: 当用户搜索两个角色间的最短路径时，路径上的连线会产生周期性的“电荷脉冲”动画。
