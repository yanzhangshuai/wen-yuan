# 规范增量：角色关系可视化

## 新增业务规范

### 关系可视化规范
- 节点数量限制：单次展示不超过 100 个节点
- 关系类型：family（亲属）、friend（朋友）、enemy（敌对）、other（其他）
- 证据关联：每条关系边必须关联至少 1 条证据

## 新增技术约束

### 前端
- 图表库：react-force-graph-2d
- 性能要求：50+ 节点时启用分页
- 交互响应：点击事件响应时间 < 100ms

### 后端
- API 端点：`GET /api/characters/[novelId]/relationships`
- 响应格式：`{ success, code, message, data: { nodes, edges }, meta }`
- 查询优化：使用 Prisma include 减少 N+1 查询

## 更新的规范

### 数据模型
- 扩展 `Relationship` 表：添加 `visualWeight` 字段（为未来关系强度计算预留）

### API 规范
- 新增关系查询 API，遵循统一响应格式

## 废弃的规范

无

## 影响范围

- 前端：新增 1 个页面，4 个组件
- 后端：新增 1 个 API 路由
- 数据库：扩展 1 个表字段（可选）

## 回滚计划

如果功能上线后出现问题：
1. 隐藏可视化入口（feature flag）
2. 回退到列表视图
3. 保留 API 端点（不影响其他功能）

## 参考

- 产品约束：`openspec/specs/constraints/`
- 技术规范：`.trellis/spec/`
