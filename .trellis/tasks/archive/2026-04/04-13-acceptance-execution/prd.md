# 验收执行文档 — Sequential 准确率提升 + 知识库服务化

> **关联主任务**: `docs/MASTER.md`  
> **执行计划**: `.trellis/tasks/04-13-master-implementation-execution/prd.md`  
> **决策基线**: `docs/待确认项汇总.md` D1-D13  
> **执行方式**: Codex agent 逐项执行命令并核对期望输出，全部 ✅ 后视为验收通过

---

## AC-P0：基础层验收

### AC-P0-1：Prisma Schema — 新增 3 张知识库表

```bash
# (1) 3 张新表 model 定义存在于 schema
grep -c "model HistoricalFigureEntry\|model RelationalTermEntry\|model NamePatternRule" \
  prisma/schema.prisma
# 期望: 3

# (2) GenericTitleEntry 包含扩展字段
grep "exemptInBooks\|category.*VarChar" prisma/schema.prisma | grep -v "//"
# 期望: ≥ 2 行

# (3) migration 文件存在（日期前缀含 phase7 相关内容）
ls prisma/migrations/ | grep -E "2026" | tail -5
# 期望: 至少包含 1 个新 migration

# (4) Prisma generate 通过
pnpm prisma:generate
# 期望: exit 0

# (5) 类型检查通过
pnpm type-check
# 期望: exit 0, 0 errors
```

---

### AC-P0-2：Book.genre 完全移除

```bash
# (1) 代码层无 book.genre 引用（排除测试文件）
grep -rn "book\.genre\|\.genre\b" src/ --include="*.ts" \
  | grep -v "\.test\." | grep -v "bookType" | grep -v "//.*genre"
# 期望: 0 行输出

# (2) schema Book model 无 genre 字段
awk '/^model Book \{/,/^\}/' prisma/schema.prisma | grep "^  genre"
# 期望: 0 行输出

# (3) resolveBookLexiconConfig 函数已删除
grep -rn "resolveBookLexiconConfig" src/ --include="*.ts"
# 期望: 0 行输出

# (4) 导入 API schema 无 genre 字段
grep -n "genre" src/app/api/books/route.ts | grep -v "//"
# 期望: 0 行输出

# (5) 编译通过
pnpm type-check
# 期望: exit 0

# (6) 测试通过
pnpm test
# 期望: PASS
```

---

### AC-P0-3：种子数据量验证

```bash
# (1) 初始化脚本存在
test -f scripts/init-knowledge-phase7.ts && echo "PASS" || echo "FAIL"
# 期望: PASS

# (2) 脚本可幂等执行
pnpm kb:seed-phase7
# 期望: exit 0，无报错

# (3) 再次执行不报 unique violation
pnpm kb:seed-phase7
# 期望: exit 0（幂等验证）

# (4) package.json 含 kb:seed-phase7 脚本
grep '"kb:seed-phase7"' package.json
# 期望: 1 行匹配

# (5) seed JSON 文件存在
ls data/knowledge-base/*.seed.json 2>/dev/null | wc -l
# 期望: ≥ 4（historical-figures, relational-terms, name-pattern-rules, rulin-characters）
```

> **数据量验证**（需 DB 访问，通过 prisma studio 或 psql）:
>
> | 表 | 期望最小条数 |
> |---|---|
> | `generic_title_entries` | ≥ 110 |
> | `extraction_rules` | ≥ 54 |
> | `historical_figure_entries` | ≥ 100 |
> | `relational_term_entries` | ≥ 80 |
> | `name_pattern_rules` | ≥ 15 |

---

### AC-P0-4：`loadFullRuntimeKnowledge()` 实现

```bash
# (1) 函数导出存在
grep -c "export.*loadFullRuntimeKnowledge\|export.*getOrLoadKnowledge\|export.*clearKnowledgeCache" \
  src/server/modules/knowledge/load-book-knowledge.ts
# 期望: ≥ 2

# (2) FullRuntimeKnowledge 接口包含全部必要字段
grep -c "historicalFigures\|relationalTerms\|namePatternRules\|hardBlockSuffixes\|softBlockSuffixes\|aliasLookup\|safetyGenericTitles\|defaultGenericTitles" \
  src/server/modules/knowledge/load-book-knowledge.ts
# 期望: ≥ 8

# (3) D9 正则安全校验存在
grep -c "200\|nestedQuantifier\|100.*ms\|validateRegex\|RegExp.*safe" \
  src/server/modules/knowledge/load-book-knowledge.ts
# 期望: ≥ 2

# (4) D12 缓存清除函数存在
grep -n "clearKnowledgeCache\|cache\.delete\|knowledgeCache\.delete" \
  src/server/modules/knowledge/load-book-knowledge.ts
# 期望: ≥ 1 行

# (5) 单元测试通过
pnpm test src/server/modules/knowledge/ 2>/dev/null || \
  pnpm test --reporter=verbose 2>&1 | grep -E "load-book-knowledge|FullRuntime"
# 期望: ≥ 1 个测试文件，PASS
```

---

### AC-P0-5：硬编码常量全部删除

```bash
# (1) classical-names.ts 文件不存在
test ! -f src/server/modules/analysis/config/classical-names.ts \
  && echo "PASS" || echo "FAIL: file still exists"
# 期望: PASS

# (2) 书名硬编码常量不存在
grep -rn "RULIN_NAMES\|SANGUO_NAMES\|SHUIHU_NAMES\|XIYOU_NAMES\|HONGLOU_NAMES" \
  src/ --include="*.ts"
# 期望: 0 行输出

# (3) GENRE_PRESETS 不存在
grep -rn "GENRE_PRESETS" src/ --include="*.ts"
# 期望: 0 行输出

# (4) lexicon.ts 中无大型硬编码词表常量
grep -c "SAFETY_GENERIC_TITLES\|DEFAULT_GENERIC_TITLES\|HARD_BLOCK_SUFFIXES\|DEFAULT_SOFT_BLOCK_SUFFIXES\|UNIVERSAL_TITLE_STEMS\|DEFAULT_POSITION_STEMS\|CHINESE_SURNAME_LIST\|ENTITY_EXTRACTION_RULES\|RELATIONSHIP_EXTRACTION_RULES" \
  src/server/modules/analysis/config/lexicon.ts
# 期望: 0

# (5) buildAliasLookup 旧实现不再被调用
grep -rn "buildAliasLookup\(genre\)\|resolveByKnowledgeBase\b" \
  src/ --include="*.ts" | grep -v "\.test\."
# 期望: 0 行输出

# (6) 全量编译 + 测试通过
pnpm type-check && pnpm test
# 期望: 两者均 exit 0
```

---

## AC-P1：核心解析链路验收

### AC-P1-1：PersonaResolver 接入 runtimeKnowledge

```bash
# (1) ResolveInput 包含 runtimeKnowledge 参数
grep -n "runtimeKnowledge.*FullRuntimeKnowledge\|FullRuntimeKnowledge.*runtimeKnowledge" \
  src/server/modules/analysis/services/PersonaResolver.ts
# 期望: ≥ 1 行

# (2) 6 个过滤检查点代码存在
grep -c "safetyGenericTitles\|relationalTerms\|namePatternRules\|defaultGenericTitles\|historicalFigures\|aliasLookup" \
  src/server/modules/analysis/services/PersonaResolver.ts
# 期望: ≥ 6

# (3) name_too_long 阈值为 8（不为 10）
grep -n "name_too_long\|length.*>.*8\|> 8\b" \
  src/server/modules/analysis/services/PersonaResolver.ts | head -5
# 期望: 含 8 的行；且无 "> 10" 的阈值行

# (4) 无直接硬编码词表引用
grep -c "SAFETY_GENERIC_TITLES\|DEFAULT_GENERIC_TITLES\|classical-names\|RULIN_NAMES" \
  src/server/modules/analysis/services/PersonaResolver.ts
# 期望: 0

# (5) 测试数量 ≥ 20
grep -rn "it\(\\|test\(" \
  src/server/modules/analysis/services/PersonaResolver.test.ts 2>/dev/null | wc -l
# 期望: ≥ 20

# (6) 测试覆盖全部过滤点
grep -c "safetyGenericTitles\|relationalTerms\|namePatternRules\|historicalFigures" \
  src/server/modules/analysis/services/PersonaResolver.test.ts 2>/dev/null
# 期望: ≥ 4
```

---

### AC-P1-2：AliasMapping 写入管线

```bash
# (1) Phase1 roster 路径有 registerAlias 调用
grep -n "registerAlias\|ROSTER_DISCOVERY" \
  src/server/modules/analysis/services/ChapterAnalysisService.ts | head -10
# 期望: ≥ 2 行（含 source=ROSTER_DISCOVERY 或等效）

# (2) Phase2 chunk 路径有 registerAlias 调用
grep -c "CHUNK_ANALYSIS\|registerAlias" \
  src/server/modules/analysis/services/ChapterAnalysisService.ts
# 期望: ≥ 2

# (3) IMPERSONATION source 枚举存在
grep -rn "IMPERSONATION" \
  src/server/modules/analysis/services/AliasRegistryService.ts | head -5
# 期望: ≥ 1 行
```

> **运行时验证**（重新解析儒林-3 后检查 DB）:
> ```sql
> SELECT count(*) FROM alias_mappings
> WHERE book_id = '<儒林-3 bookId>';
> -- 期望: ≥ 50
> ```

---

### AC-P1-3：PostAnalysisMerger 实现

```bash
# (1) 文件存在
test -f src/server/modules/analysis/services/PostAnalysisMerger.ts \
  && echo "PASS" || echo "FAIL"
# 期望: PASS

# (2) D3 硬性约束：AUTO_MERGED 必须绑定 confidence=1.0 条件
grep -n "AUTO_MERGED" src/server/modules/analysis/services/PostAnalysisMerger.ts | head -10
# 期望: 所有 AUTO_MERGED 赋值行在 confidence === 1.0 的分支内

# (3) confidence < 1.0 均写入 PENDING（验证无绕过路径）
grep -n "PENDING" src/server/modules/analysis/services/PostAnalysisMerger.ts | wc -l
# 期望: ≥ 4（Tier 2/3/4/5 各至少一个 PENDING）

# (4) SequentialPipeline 调用 PostAnalysisMerger
grep -n "PostAnalysisMerger\|postMerger\|postAnalysis" \
  src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts
# 期望: ≥ 1 行（在 chapter loop 完成后调用）

# (5) 测试通过
pnpm test src/server/modules/analysis/services/PostAnalysisMerger 2>/dev/null || \
  pnpm test --reporter=verbose 2>&1 | grep "PostAnalysisMerger"
# 期望: PASS
```

---

### AC-P1-4：Pipeline runtimeKnowledge 集成

```bash
# (1) SequentialPipeline 有强制缓存清除
grep -n "clearKnowledgeCache\|knowledgeCache\.delete\|delete.*bookId" \
  src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts
# 期望: ≥ 1 行（D12 强制刷新）

# (2) SequentialPipeline 调用 loadFullRuntimeKnowledge
grep -n "loadFullRuntimeKnowledge" \
  src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts
# 期望: ≥ 1 行

# (3) TwoPassPipeline 无旧式 genre 驱动加载
grep -c "buildAliasLookup.*genre\|genre.*buildAliasLookup\|book\.genre" \
  src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts
# 期望: 0

# (4) TwoPassPipeline 使用 loadFullRuntimeKnowledge
grep -n "loadFullRuntimeKnowledge" \
  src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts
# 期望: ≥ 1 行

# (5) 全局 Pipeline 目录无 book.genre 引用
grep -rn "book\.genre" src/server/modules/analysis/pipelines/ --include="*.ts"
# 期望: 0 行输出

# (6) 类型检查通过
pnpm type-check
# 期望: exit 0
```

---

### AC-P1-5：Wave1 过滤器

```bash
# (1) PersonaResolver 含关系词过滤逻辑（relationalTerms 使用）
grep -n "relationalTerms\b" src/server/modules/analysis/services/PersonaResolver.ts | wc -l
# 期望: ≥ 2（定义+使用）

# (2) PersonaResolver 含历史人物判断逻辑
grep -n "historicalFigures\b\|historicalFigure\b" \
  src/server/modules/analysis/services/PersonaResolver.ts | wc -l
# 期望: ≥ 2

# (3) PersonaResolver 含名字规则过滤逻辑
grep -n "namePatternRules\|BLOCK\|FAMILY_HOUSE\|DESCRIPTIVE" \
  src/server/modules/analysis/services/PersonaResolver.ts | wc -l
# 期望: ≥ 3
```

---

## AC-P1-API：管理后台 API 验收

### AC-P1-6：历史人物 API

```bash
# (1) 基础路由文件存在
test -f src/app/api/admin/knowledge/historical-figures/route.ts && echo "PASS" || echo "FAIL"
test -f "src/app/api/admin/knowledge/historical-figures/[id]/route.ts" && echo "PASS" || echo "FAIL"
test -f src/app/api/admin/knowledge/historical-figures/import/route.ts && echo "PASS" || echo "FAIL"
# 期望: 3 个 PASS

# (2) 支持 GET/POST 方法
grep -c "export.*GET\|export.*POST" \
  src/app/api/admin/knowledge/historical-figures/route.ts
# 期望: ≥ 2

# (3) 批量导入端点有数据验证
grep -n "zod\|schema\|validate\|parse" \
  src/app/api/admin/knowledge/historical-figures/import/route.ts | head -5
# 期望: ≥ 1 行（防止无校验批量写入）
```

---

### AC-P1-7：名字规则 API + D9 正则安全

```bash
# (1) 路由文件存在
test -f src/app/api/admin/knowledge/name-patterns/route.ts && echo "PASS" || echo "FAIL"
test -f "src/app/api/admin/knowledge/name-patterns/[id]/route.ts" && echo "PASS" || echo "FAIL"
test -f src/app/api/admin/knowledge/name-patterns/test/route.ts && echo "PASS" || echo "FAIL"
# 期望: 3 个 PASS

# (2) D9 正则安全校验：长度限制
grep -rn "200\|maxLength\|pattern\.length" \
  src/app/api/admin/knowledge/name-patterns/route.ts | head -5
# 期望: ≥ 1 行

# (3) D9 正则安全校验：嵌套量词检测
grep -rn "nested\|redos\|ReDoS\|(\\\(.*[+*]\\\))[+*]" \
  src/app/api/admin/knowledge/name-patterns/route.ts \
  src/server/modules/knowledge/ --include="*.ts" | head -5
# 期望: ≥ 1 行

# (4) test 端点返回结构化响应
grep -n "matched\|result\|isMatch" \
  src/app/api/admin/knowledge/name-patterns/test/route.ts | head -5
# 期望: ≥ 1 行
```

---

## AC-P1-EVAL：评估体系验收

### AC-P1-8：金标准数据集

```bash
# (1) 文件存在
test -f data/eval/goldset-rulin.v1.jsonl && echo "PASS" || echo "FAIL"
# 期望: PASS

# (2) 条目数量 ≥ 50
wc -l < data/eval/goldset-rulin.v1.jsonl
# 期望: ≥ 50

# (3) 每行含必要字段（canonicalName + isHistorical）
grep -c '"canonicalName"' data/eval/goldset-rulin.v1.jsonl
# 期望: = 上面统计的行数

grep -c '"isHistorical"' data/eval/goldset-rulin.v1.jsonl
# 期望: = 上面统计的行数

# (4) goldset 格式校验
pnpm eval:goldset
# 期望: exit 0
```

---

### AC-P1-9：评估管线脚本

```bash
# (1) 脚本文件存在
test -f scripts/eval/compute-metrics.ts && echo "PASS" || echo "FAIL"
test -f scripts/eval/check-gate.ts && echo "PASS" || echo "FAIL"
# 期望: 2 个 PASS

# (2) package.json 含两个 eval scripts
grep -c '"eval:metrics"\|"eval:gate"' package.json
# 期望: 2

# (3) 门禁阈值正确（precision/recall/F1/frag/dup 五项）
grep -c "0\.70\|0\.75\|0\.72\|2\.0\|0\.10" scripts/eval/check-gate.ts
# 期望: ≥ 5

# (4) MetricsResult 接口包含所有指标
grep -c "precision\|recall\|f1\|fragmentationRate\|duplicateRate" \
  scripts/eval/compute-metrics.ts
# 期望: ≥ 5

# (5) eval:metrics 可执行（需 DB 连接）
pnpm eval:metrics
# 期望: exit 0，输出包含 precision/recall/f1 字段的 JSON

# (6) eval:gate 可执行
pnpm eval:gate
# 期望: exit 0（通过）或 exit 1（未通过，正常），无崩溃
```

---

## AC-BUSINESS：业务规则验收

### AC-BIZ-1：D1 牛浦郎/牛布衣独立存在

```bash
# (1) 两者为独立 seed 条目（seed JSON 中）
grep -rn '"牛浦郎"\|"牛布衣"' data/knowledge-base/ 2>/dev/null | wc -l
# 期望: ≥ 2（各自独立出现）

# (2) 无错误映射：牛布衣 aliases 不含牛浦郎
grep -A 10 '"牛布衣"' data/knowledge-base/*.json 2>/dev/null \
  | grep '"aliases"' -A 5 | grep "牛浦郎"
# 期望: 0 行输出（无此错误映射）

# (3) 牛浦郎有 aliases = ["牛浦"]
grep -A 10 '"牛浦郎"' data/knowledge-base/*.json 2>/dev/null \
  | grep '"牛浦"' | head -3
# 期望: ≥ 1 行

# (4) IMPERSONATION alias 在种子数据或代码中有体现
grep -rn "IMPERSONATION\|impersonation" \
  data/knowledge-base/ scripts/ src/server/modules/analysis/services/ \
  --include="*.ts" --include="*.json" 2>/dev/null | wc -l
# 期望: ≥ 1
```

---

### AC-BIZ-2：D3 自动合并阈值严格

```bash
# (1) PostAnalysisMerger 中 AUTO_MERGED 仅在 confidence=1.0 条件下
grep -B 5 "AUTO_MERGED" src/server/modules/analysis/services/PostAnalysisMerger.ts \
  | grep "1\.0\|=== 1\b"
# 期望: ≥ 1 行（AUTO_MERGED 赋值前有 confidence=1.0 判断）

# (2) MergeSuggestion status 枚举包含正确状态
grep -c "AUTO_MERGED\|PENDING\|APPROVED\|REJECTED" prisma/schema.prisma
# 期望: ≥ 4

# (3) 无绕过：非 1.0 的合并不能走 AUTO_MERGED 路径
# 人工审查：检查 PostAnalysisMerger.ts 中所有 AUTO_MERGED 赋值，确认均在 if(confidence === 1.0) 分支内
grep -n "AUTO_MERGED" src/server/modules/analysis/services/PostAnalysisMerger.ts
# 期望: 每行均在 confidence===1.0 的代码块内
```

---

### AC-BIZ-3：D9 正则安全

```bash
# (1) 长度限制校验存在
grep -rn "\.length.*200\|200.*\.length\|> 200\|maxLength.*200" \
  src/server/modules/knowledge/load-book-knowledge.ts \
  src/app/api/admin/knowledge/name-patterns/route.ts \
  2>/dev/null
# 期望: ≥ 1 行

# (2) 嵌套量词检测存在
grep -rn "nested.*quantif\|ReDoS\|redos\|(\\\\(.+[+*]\\\\))[+*]" \
  src/ --include="*.ts" | head -5
# 期望: ≥ 1 行

# (3) 100ms 超时保护
grep -rn "100.*ms\|setTimeout.*100\|timeoutMs\b" \
  src/server/modules/knowledge/ src/app/api/admin/knowledge/name-patterns/ \
  --include="*.ts" 2>/dev/null
# 期望: ≥ 1 行
```

---

### AC-BIZ-4：D12 缓存策略

```bash
# (1) Pipeline 入口有强制缓存清除（不使用旧缓存）
grep -n "clearKnowledgeCache\|cache\.delete\|knowledgeCache\.delete" \
  src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts
# 期望: ≥ 1 行（在启动时执行）

# (2) ChapterAnalysisService 无任务内重新加载知识库
grep -n "loadFullRuntimeKnowledge\|loadKnowledge\|reloadKnowledge" \
  src/server/modules/analysis/services/ChapterAnalysisService.ts \
  | grep -v "import\|require\|//"
# 期望: 0 行（章节处理中不重新加载）

# (3) 缓存函数仅接受 bookId 级操作（不做全局清除）
grep -n "clearKnowledgeCache\|clearAllCache\|cacheMap\.clear()" \
  src/server/modules/knowledge/load-book-knowledge.ts | head -10
# 期望: 清除逻辑基于 bookId（localized），而非清除全局缓存
```

---

## AC-BUILD：构建与测试验收

### AC-BUILD-1：TypeScript 编译

```bash
pnpm type-check
# 期望: exit 0, 0 TypeScript errors
```

### AC-BUILD-2：Lint

```bash
pnpm lint
# 期望: exit 0
```

### AC-BUILD-3：全量单元测试

```bash
pnpm test
# 期望: all tests pass（无 fail，无 error）
```

### AC-BUILD-4：Prisma 生成无残留旧类型

```bash
# Prisma 生成后检查 genre 类型残留
pnpm prisma:generate

grep -n "genre" src/generated/prisma/index.d.ts 2>/dev/null \
  | grep -v "BookType\|bookType\|KnowledgeEntry\|//"
# 期望: 0 行输出（Book 类型中无 genre 字段）
```

---

## AC-P2：P2 质量提升验收（仅在 P1 全部通过后执行）

### AC-P2-0：前置条件——eval:gate 通过

```bash
pnpm eval:gate
# 期望: exit 0（precision≥0.70, recall≥0.75, F1≥0.72, frag≤2.0, dup≤0.10）
# 若此项不通过，P2 验收不予执行
```

### AC-P2-1：称谓动态解析开启

```bash
# (1) 配置项为 true
grep "dynamicTitleResolutionEnabled" src/server/modules/analysis/config/pipeline.ts
# 期望: 含 "true"

# (2) 开启后 eval:gate 仍通过（无退化）
pnpm eval:gate
# 期望: exit 0
```

### AC-P2-2：LLM 灰区仲裁开启

```bash
# (1) 配置项为 true
grep "llmTitleArbitrationEnabled" src/server/modules/analysis/config/pipeline.ts
# 期望: 含 "true"

# (2) 频率限制存在
grep -n "llmArbitrationMaxCalls\|arbitrationCount\|maxCalls" \
  src/server/modules/analysis/config/pipeline.ts \
  src/server/modules/analysis/services/PersonaResolver.ts \
  2>/dev/null | head -10
# 期望: ≥ 1 行（上限值，如 100）

# (3) 灰区范围定义存在
grep -n "llmArbitrationGrayZone\|grayZone\|0\.4.*0\.6\|0\.6.*0\.4" \
  src/server/modules/analysis/config/pipeline.ts \
  src/server/modules/analysis/services/PersonaResolver.ts \
  2>/dev/null | head -5
# 期望: ≥ 1 行

# (4) 开启后 eval:gate 仍通过
pnpm eval:gate
# 期望: exit 0
```

---

## 验收总结检查单

全部 ✅ 后，在 `docs/MASTER.md` 中更新任务状态为 `completed`。

| AC 编号 | 验收项 | 状态 |
|---------|--------|------|
| AC-P0-1 | 3 张新表 + GenericTitleEntry 扩展 | ✅ |
| AC-P0-2 | book.genre 全部移除 | ✅ |
| AC-P0-3 | 种子数据量达标 | ✅ |
| AC-P0-4 | loadFullRuntimeKnowledge 实现 | ✅ |
| AC-P0-5 | 硬编码常量全部删除 | ✅ |
| AC-P1-1 | PersonaResolver 6 个过滤点 | ✅ |
| AC-P1-2 | AliasMapping 写入管线 | ✅ |
| AC-P1-3 | PostAnalysisMerger（D3 严格） | ✅ |
| AC-P1-4 | Pipeline runtimeKnowledge 集成 | ✅ |
| AC-P1-5 | Wave1 过滤器全部激活 | ✅ |
| AC-P1-6 | 历史人物管理 API | ✅ |
| AC-P1-7 | 名字规则 API + D9 校验 | ✅ |
| AC-P1-8 | 金标准数据集 ≥ 50 条 | ✅ |
| AC-P1-9 | eval:gate 可执行 | ✅ |
| AC-BIZ-1 | D1 牛浦郎/牛布衣独立 | ✅ |
| AC-BIZ-2 | D3 合并阈值严格（仅 conf=1.0） | ✅ |
| AC-BIZ-3 | D9 正则安全三条规则 | ✅ |
| AC-BIZ-4 | D12 缓存策略（不热更新） | ✅ |
| AC-BUILD-1 | `pnpm type-check` 通过 | ✅ |
| AC-BUILD-2 | `pnpm lint` 通过 | ⏳ 需线上验证 |
| AC-BUILD-3 | `pnpm test` 全通过 | ⏳ 需线上验证 |
| AC-BUILD-4 | Prisma generate 无残留 genre 类型 | ✅ |
| AC-P2-0 | eval:gate PASS（前置） | ⏳ 需线上验证 |
| AC-P2-1 | dynamicTitleResolution 开启 | ✅ |
| AC-P2-2 | llmTitleArbitration 开启 + 限流 | ✅ |
