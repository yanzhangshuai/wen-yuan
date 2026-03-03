0. 项目背景与目标
我正在开发一个名为 “文渊 (Wen Yuan)” 的文学分析系统。该系统使用 Next.js 15, Prisma (PostgreSQL), 和 Neo4j。
当前任务：编写一个核心服务类 ChapterAnalysisService，利用 模型 AI （如 Gemini、deepseek）将小说章节原文解析为结构化的文学数据。要求 将 AI 模型创建一个抽象层，方便未来替换不同的 AI 提供商。


1.技术栈与规范
框架: Next.js 16 (App Router)

语言: TypeScript (严格模式)

ORM: Prisma 6.x (PostgreSQL)

AI SDK: Google Generative AI (@google/generative-ai)

命名规范:

数据库交互：遵循 prisma/schema.prisma 中的复数映射（如 biography_records）。

目录结构：模块化设计，关注点分离。

2. 预期的文件目录
请按以下结构生成代码，并确保路径引用正确：

Plaintext
src/
├── app/api/analyze/route.ts       # API Route 控制器
├── services/
│   ├── analysis/
│   │   ├── ChapterAnalysisService.ts # 核心业务逻辑类
│   │   └── PersonaResolver.ts       # 专门处理实体对齐与模糊匹配
│   └── ai/
│       ├── geminiClient.ts           # Gemini API 初始化与封装
│       └── prompts.ts                # 结构化 Prompt 模板
└── types/
    └── analysis.ts                   # AI 响应的 Zod Schema 或 Interface
3. 核心逻辑要求
A. 智能实体对齐 (Entity Resolution)
在 PersonaResolver 中实现一个算法：

当 AI 提取出名字（如“王元明”）时，先检索 personas 表中的 name 或 global_tags（别名）。

使用字符串相似度算法（如 Levenshtein）处理细微差异。

原则：尽可能合并到已有 Persona，只有在置信度极低时才创建新记录。

B. ChapterAnalysisService 实现
输入: chapterId: string。

流程:

从数据库获取章节 content 和当前书已有的 profiles 人物列表（作为上下文传给 AI）。

调用 Gemini 3.1 Flash，启用 responseMimeType: "application/json"。

多模型协作：如果章节过长，请展示如何进行分段解析或摘要预处理。

事务写入：使用 prisma.$transaction。

更新 biography_records（生平轨迹）。

更新 mentions（原文提及）。

更新 relationships（动态社交关系）。

C. Prompt 设计规范
在 prompts.ts 中，Prompt 必须包含：

角色定位：中国古典文学专家。

任务目标：分析讽刺手法、人物仕途变迁、地理移动。

字段映射：强制 AI 输出符合 biography_records 枚举（CAREER, TRAVEL 等）的 JSON。

4. 工程化要求 (Next.js 16 特性)
Server Actions: 提供一个可供前端调用的 Server Action 封装。

Logging: 使用结构化日志记录解析进度。

注释与文档: 遵循 JSDoc 标准，对复杂的 ironyNote 提取逻辑进行详细说明。

错误边界: 处理 AI 幻觉（例如提取了书中不存在的人物）。
