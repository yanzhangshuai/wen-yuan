# 后端验收执行清单（严格执行版）

## 0. 执行规则（先确认）
- [ ] 验收标准以 [TDD.md](/home/mwjz/code/wen-yuan/docs/v1/backend/TDD.md) 为准。
- [ ] 操作步骤以 [TDD-steps.md](/home/mwjz/code/wen-yuan/docs/v1/backend/TDD-steps.md) 为准。
- [ ] 全流程按 `1 -> 12` 顺序执行，不跳步。
- [ ] 任一步骤失败，先修复再重跑，不得带失败进入下一步。
- [ ] 不得降低覆盖率门槛，不得把 `skip` 视为通过。

## 1. 环境准备（对应 TDD-steps §1）
- [ ] `pnpm install`
- [ ] `pnpm prisma:generate`
- [ ] `pnpm prisma:migrate`
- [ ] `pnpm prisma:seed`
- [ ] `.env.test` 完整配置（DATABASE_URL/JWT_SECRET/APP_ENCRYPTION_KEY/STORAGE/NODE_ENV）
- [ ] `pnpm build` 通过（0 errors）
- [ ] `pnpm lint` 通过（0 errors, 0 warnings）

## 2. Token / 认证测试准备（对应 TDD-steps §2）
- [ ] 单测使用 `x-auth-role` 头完成管理员/游客分支覆盖。
- [ ] 集成测试可生成并注入真实 JWT（`issueAuthToken`）。
- [ ] 已覆盖过期 token、篡改 token 场景。
- [ ] 登录接口 Origin 同源/非同源校验路径已覆盖。

## 3. 文件上传测试准备（对应 TDD-steps §3）
- [ ] `multipart/form-data` 测试使用 `FormData + File`。
- [ ] 已覆盖 `.txt` 合法上传。
- [ ] 已覆盖 >50MB 超限拒绝（413）。
- [ ] 已覆盖非 `.txt` 拒绝（400）。
- [ ] 未手写 `multipart/form-data` 的 `Content-Type`。

## 4. 单元测试结构规范（对应 TDD-steps §4）
- [ ] `vi.mock` 顺序正确（mock 先于被测模块加载）。
- [ ] 使用懒加载 `await import(...)` 避免 mock 失效。
- [ ] `afterEach` 重置 mock 与模块缓存（按需）。
- [ ] Route Handler 测试 `context.params` 使用 `Promise.resolve(...)`。
- [ ] 成功/失败 envelope 通用断言可复用。

## 5. 集成测试规范（对应 TDD-steps §5）
- [ ] 使用测试数据库，且与生产隔离。
- [ ] 具备测试数据创建与清理能力。
- [ ] 能完整执行“场景A：书籍导入链路”。
- [ ] 集成用例结束后执行清理并断开 Prisma 连接。

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
- [ ] 书籍 CRUD 验收全部通过
- [ ] 章节预览/确认/阅读验收全部通过
- [ ] `POST /api/books/:id/analyze` 验收通过：
  - [ ] HTTP `202 Accepted`
  - [ ] `code = BOOK_ANALYSIS_STARTED`
  - [ ] fire-and-forget（不 await 执行完成）
- [ ] `GET /api/books/:id/status` 进度字段与状态语义正确
- [ ] `runAnalysisJob` 状态机测试通过（QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELED）
- [ ] `ChapterAnalysisService` 核心验收通过

## 8. Phase 3 执行（对应 TDD §6 + TDD-steps §8）
- [ ] 图谱数据接口（节点/边/筛选/章节范围）验收通过
- [ ] 情感映射与权重语义验收通过
- [ ] 最短路径 API（含 Neo4j 缺失降级）验收通过
- [ ] Graph 布局保存/读取验收通过

## 9. Phase 4 执行（对应 TDD §7/§8 + TDD-steps §9）
- [ ] 人物 CRUD 验收通过（含 soft delete、权限边界）
- [ ] 关系 CRUD 验收通过（含去重冲突与权限）
- [ ] 传记事件 CRUD 验收通过（含 enum 校验）
- [ ] 批量审核 API 验收通过（verify/reject）
- [ ] 合并建议 API 验收通过（accept/reject/defer）
- [ ] 人物合并事务验收通过（重定向、冲突处理、别名归并、source 软删）

## 10. Phase 5 执行（对应 TDD §8/§9/§11 + TDD-steps §10）
- [ ] 模型列表/更新/默认模型/连通性测试验收通过
- [ ] API Key 存储加密、响应脱敏验收通过
- [ ] `src/server/security/encryption.test.ts` 存在且第九节用例全通过
- [ ] SSRF 防护（白名单）验收通过
- [ ] SQL 注入、敏感日志、路径穿越等安全扫描通过

## 11. 覆盖率与全量回归（对应 TDD §14 + TDD-steps §11）
- [ ] `pnpm test:unit` 全绿（0 fail, 0 skip）
- [ ] 测试文件数 >= 67（按 TDD 清单核对）
- [ ] 总用例数 >= 400
- [ ] 覆盖率达标：
  - [ ] lines >= 80%
  - [ ] branches >= 70%
  - [ ] functions >= 80%
  - [ ] statements >= 80%

## 12. 最终 DoD 关卡（对应 TDD §18）
- [ ] TypeScript/Lint/NoEmit 全绿
- [ ] 数据库迁移状态与 seed 幂等通过
- [ ] OWASP 基线通过
- [ ] API envelope 契约通过
- [ ] 全链路场景 A-E 全部通过
- [ ] 所有失败项已清零，且无未解释偏差

## 13. 失败处理与重跑规则
- [ ] 失败项记录：命令、时间、错误摘要、影响章节
- [ ] 修复后只允许从失败步骤开始重跑，不得跳过前置依赖步骤
- [ ] 同一失败连续 2 次未解决时，先做根因分析再继续执行

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
