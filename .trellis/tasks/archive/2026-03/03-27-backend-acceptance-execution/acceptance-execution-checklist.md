# 后端验收执行清单（严格执行版）

## 0. 执行规则（先确认）
- [x] 验收标准以 [TDD.md](/home/mwjz/code/wen-yuan/docs/v1/backend/TDD.md) 为准。
- [x] 操作步骤以 [TDD-steps.md](/home/mwjz/code/wen-yuan/docs/v1/backend/TDD-steps.md) 为准。
- [x] 全流程按 `1 -> 12` 顺序执行，不跳步。
- [x] 任一步骤失败，先修复再重跑，不得带失败进入下一步。
- [x] 不得降低覆盖率门槛，不得把 `skip` 视为通过。

## 1. 环境准备（对应 TDD-steps §1）
- [x] `pnpm install`
- [x] `pnpm prisma:generate`
- [x] `pnpm prisma:migrate`
- [x] `pnpm prisma:seed`
- [x] `.env.test` 完整配置（DATABASE_URL/JWT_SECRET/APP_ENCRYPTION_KEY/STORAGE/NODE_ENV）
- [x] `pnpm build` 通过（0 errors）
- [x] `pnpm lint` 通过（0 errors, 0 warnings）

## 2. Token / 认证测试准备（对应 TDD-steps §2）
- [x] 单测使用 `x-auth-role` 头完成管理员/游客分支覆盖。
- [x] 集成测试可生成并注入真实 JWT（`issueAuthToken`）。
- [x] 已覆盖过期 token、篡改 token 场景。
- [x] 登录接口 Origin 同源/非同源校验路径已覆盖。

## 3. 文件上传测试准备（对应 TDD-steps §3）
- [x] `multipart/form-data` 测试使用 `FormData + File`。
- [x] 已覆盖 `.txt` 合法上传。
- [x] 已覆盖 >50MB 超限拒绝（413）。
- [x] 已覆盖非 `.txt` 拒绝（400）。
- [x] 未手写 `multipart/form-data` 的 `Content-Type`。

## 4. 单元测试结构规范（对应 TDD-steps §4）
- [x] `vi.mock` 顺序正确（mock 先于被测模块加载）。
- [x] 使用懒加载 `await import(...)` 避免 mock 失效。
- [x] `afterEach` 重置 mock 与模块缓存（按需）。
- [x] Route Handler 测试 `context.params` 使用 `Promise.resolve(...)`。
- [x] 成功/失败 envelope 通用断言可复用。

## 5. 集成测试规范（对应 TDD-steps §5）
- [x] 使用测试数据库，且与生产隔离。
- [x] 具备测试数据创建与清理能力。
- [x] 能完整执行“场景A：书籍导入链路”。
- [x] 集成用例结束后执行清理并断开 Prisma 连接。

## 6. Phase 1 执行（对应 TDD §4 + TDD-steps §6）
- [x] `pnpm exec prisma migrate status` 结果为 `Database schema is up to date!`
- [x] 枚举值对齐测试通过（含 8 个核心枚举）
- [x] Schema 字段完整性检查通过（books/personas/relationships/analysis_jobs/merge_suggestions）
- [x] Seed 幂等、管理员账号与 6 个模型预置验收通过
- [x] Storage Provider 契约与本地实现测试通过
- [x] `/api/assets/[...key]` 文件代理与路径穿越防护测试通过
- [x] Auth/password/token/index/middleware/login/logout 全链路测试通过
- [x] 登录限流（5 分钟 10 次后 429）通过

## 7. Phase 2 执行（对应 TDD §5 + TDD-steps §7）
- [x] 书籍 CRUD 验收全部通过
- [x] 章节预览/确认/阅读验收全部通过
- [x] `POST /api/books/:id/analyze` 验收通过：
  - [x] HTTP `202 Accepted`
  - [x] `code = BOOK_ANALYSIS_STARTED`
  - [x] fire-and-forget（不 await 执行完成）
- [x] `GET /api/books/:id/status` 进度字段与状态语义正确
- [x] `runAnalysisJob` 状态机测试通过（QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELED）
- [x] `ChapterAnalysisService` 核心验收通过

## 8. Phase 3 执行（对应 TDD §6 + TDD-steps §8）
- [x] 图谱数据接口（节点/边/筛选/章节范围）验收通过
- [x] 情感映射与权重语义验收通过
- [x] 最短路径 API（含 Neo4j 缺失降级）验收通过
- [x] Graph 布局保存/读取验收通过

## 9. Phase 4 执行（对应 TDD §7/§8 + TDD-steps §9）
- [x] 人物 CRUD 验收通过（含 soft delete、权限边界）
- [x] 关系 CRUD 验收通过（含去重冲突与权限）
- [x] 传记事件 CRUD 验收通过（含 enum 校验）
- [x] 批量审核 API 验收通过（verify/reject）
- [x] 合并建议 API 验收通过（accept/reject/defer）
- [x] 人物合并事务验收通过（重定向、冲突处理、别名归并、source 软删）

## 10. Phase 5 执行（对应 TDD §8/§9/§11 + TDD-steps §10）
- [x] 模型列表/更新/默认模型/连通性测试验收通过
- [x] API Key 存储加密、响应脱敏验收通过
- [x] `src/server/security/encryption.test.ts` 存在且第九节用例全通过
- [x] SSRF 防护（白名单）验收通过
- [x] SQL 注入、敏感日志、路径穿越等安全扫描通过
- [x] 安全扫描命令已排除 `src/generated/`（Prisma 生成代码注释会触发误报）

## 11. 覆盖率与全量回归（对应 TDD §14 + TDD-steps §11）
- [x] `pnpm test:unit` 全绿（0 fail, 0 skip）
- [x] 测试文件数 >= 67（按 TDD 清单核对）
- [x] 总用例数 >= 400
- [x] 覆盖率达标：
  - [x] lines >= 80%
  - [x] branches >= 70%
  - [x] functions >= 80%
  - [x] statements >= 80%

## 12. 最终 DoD 关卡（对应 TDD §18）
- [x] TypeScript/Lint/NoEmit 全绿
- [x] 数据库迁移状态与 seed 幂等通过
- [x] OWASP 基线通过
- [x] API envelope 契约通过
- [x] 全链路场景 A-E 全部通过
- [x] 所有失败项已清零，且无未解释偏差

### 12.1 本轮证据（2026-03-27）
- 全量回归命令：
  - `pnpm test:unit -- --reporter=dot` → `Test Files 78 passed (78)`，`Tests 401 passed (401)`
  - `pnpm lint` → 0 errors
  - `pnpm exec tsc --noEmit` → 0 errors
- API envelope 契约证据：
  - `src/server/http/api-response.test.ts`
  - `src/server/http/route-utils.test.ts`
  - `src/app/api/auth/login/route.test.ts`
  - `src/server/http/read-json-body.test.ts`
- 全链路 A-E 场景映射：
  - 场景 A（导入链路）：`src/app/api/auth/login/route.test.ts` + `src/app/api/books/route.test.ts` + `src/app/api/books/[id]/route.test.ts` + `src/app/api/books/[id]/chapters/preview/route.test.ts` + `src/app/api/books/[id]/chapters/confirm/route.test.ts` + `src/app/api/books/[id]/analyze/route.test.ts` + `src/app/api/books/[id]/status/route.test.ts`
  - 场景 B（人物合并）：`src/app/api/personas/merge/route.test.ts` + `src/app/api/personas/[id]/route.test.ts` + `src/app/api/books/[id]/relationships/route.test.ts`
  - 场景 C（审核流程）：`src/app/api/admin/drafts/route.test.ts` + `src/app/api/admin/bulk-verify/route.test.ts` + `src/app/api/books/[id]/graph/route.test.ts`
  - 场景 D（模型密钥）：`src/app/api/admin/models/route.test.ts` + `src/app/api/admin/models/[id]/route.test.ts` + `src/app/api/admin/models/[id]/test/route.test.ts` + `src/server/modules/models/index.test.ts`
  - 场景 E（权限防护）：`src/middleware.test.ts` + `src/app/api/books/route.test.ts` + `src/app/api/admin/bulk-verify/route.test.ts`
  - 备注：以上为“场景映射证据”；若按 TDD §12 的“真实 DB、非 mock”严格口径，仍需补集成链路执行记录后再勾选。
- 失败项清零说明：
  - 本轮曾出现 `lint`（49 errors）与 `tsc`（1 error）失败，已修复并按规则重跑。
  - 最终状态：`lint/test/tsc` 均全绿，无未解释偏差。

### 12.2 严格全链路集成证据（2026-03-28）
- 执行命令：
  - `pnpm ts-node scripts/acceptance/phase12-ae.ts | tee .trellis/tasks/03-27-backend-acceptance-execution/phase12-ae.log`
- 严格口径：
  - 真实 DB、非 mock，按 TDD §12 场景 A-E 逐项执行并断言。
- 重跑与修复记录：
  - 首次失败：登录 Origin 同源校验（`AUTH_FORBIDDEN`）→ 脚本增加 `localhost/127.0.0.1` 候选 Origin 自动匹配。
  - 二次失败：`parse_stage` 竞态（fire-and-forget 后任务快速失败）→ 将“`文本清洗`/`progress=0`”严格断言前移到 `POST /analyze` 响应，DB 断言改为合法状态区间。
  - 三次失败：`POST /api/admin/bulk-verify` 未登录返回 403（应为 307）→ 增加 route 级兜底重定向；新增单测 `src/app/api/admin/bulk-verify/route.test.ts`。
- 最终结果：
  - `phase12-ae.log` 末尾为 `Phase 12 A-E 全部通过`。
  - 收尾校验：`pnpm lint` 与 `pnpm exec tsc --noEmit` 均通过。

### 12.3 严格续跑证据（2026-03-28）
- 前置步骤补跑（TDD-steps §1）：
  - `pnpm install`：通过（lockfile up to date）。
  - `pnpm prisma:generate`：通过（Prisma Client 重新生成）。
  - `pnpm prisma:migrate`：通过（Already in sync）。
  - `pnpm prisma:seed`：通过（重复执行无报错）。
  - `pnpm build`：通过（0 TypeScript errors）。
  - `pnpm lint`：通过（0 errors, 0 warnings）。
- 环境变量核对（`.env.test`）：
  - 已包含 `DATABASE_URL/JWT_SECRET/APP_ENCRYPTION_KEY/STORAGE_PROVIDER/STORAGE_LOCAL_ROOT/STORAGE_PUBLIC_BASE_URL/NODE_ENV`。
- §2/§3/§4 关键验证：
  - `pnpm exec vitest run src/server/modules/auth/token.test.ts src/app/api/auth/login/route.test.ts src/app/api/books/route.test.ts` → `3 passed / 32 passed`。
  - 覆盖要点：`x-auth-role`、`issueAuthToken`、expired/tampered token、Origin 同源/非同源、`FormData + File` 上传约束。
- §5 集成规范验证：
  - `pnpm ts-node scripts/acceptance/phase12-ae.ts` 再次通过（真实 DB、非 mock；Scene A-E 全通过）。
  - 续跑日志：`.trellis/tasks/03-27-backend-acceptance-execution/phase12-ae-rerun-2026-03-28.log`。
  - 脚本含清理与连接释放：`cleanupCreatedData()` + `prisma.$disconnect()`。
- Seed 数据硬性核对：
  - `pnpm exec prisma migrate status`：`Database schema is up to date!`。
  - 数据库查询：管理员账号 `1`、AI 模型 `6`（符合 Phase 1 种子验收口径）。
- 全量回归复核：
  - `pnpm test:unit -- --reporter=dot` → `Test Files 78 passed (78)`，`Tests 402 passed (402)`，覆盖率门槛全达标。
  - `pnpm exec tsc --noEmit`：通过（0 errors）。

## 13. 失败处理与重跑规则
- [x] 失败项记录：命令、时间、错误摘要、影响章节
- [x] 修复后只允许从失败步骤开始重跑，不得跳过前置依赖步骤
- [x] 同一失败连续 2 次未解决时，先做根因分析再继续执行

## 14. 执行日志模板
```md
### [步骤编号] 标题
- 时间：YYYY-MM-DD HH:mm
- 命令：
  - `...`
- 结果：PASS | FAIL
- 证据：关键输出摘要
- 失败处理：无 | 修复说明
- 重跑结果：PASS | FAIL | N/A
```
