# 设计方案：角色关系可视化

## 架构设计

### 前端组件
- `CharacterNetworkGraph`: 主图表组件
- `RelationshipFilter`: 关系类型筛选器
- `NodeDetailPanel`: 节点详情面板
- `EdgeDetailPanel`: 边详情面板

### 后端 API
- `GET /api/characters/[novelId]/relationships`: 获取关系数据
- 返回格式：`{ nodes: [], edges: [] }`

### 数据流
```
用户访问页面 -> 加载关系数据 -> 渲染网络图 -> 用户交互 -> 更新视图
```

## 技术选型

### 图表库
选择 **react-force-graph-2d**
- 理由：轻量、性能好、支持力导向布局
- 备选：D3.js（过于复杂）、vis.js（体积大）

### 数据结构
```typescript
interface Node {
  id: string
  name: string
  type: 'main' | 'supporting' | 'minor'
}

interface Edge {
  source: string
  target: string
  type: 'family' | 'friend' | 'enemy' | 'other'
  evidenceIds: string[]
}
```

## UI/UX 设计

### 布局
- 左侧：筛选器（20%）
- 中间：网络图（60%）
- 右侧：详情面板（20%）

### 交互
- 拖拽节点：调整位置
- 滚轮：缩放
- 点击节点：显示详情
- 点击边：显示关系证据

### 视觉
- 节点颜色：按角色类型区分
- 边粗细：按关系强度（暂时固定）
- 边颜色：按关系类型区分

## 性能优化

1. 数据分页：超过 50 个节点时启用
2. 虚拟化：只渲染可见区域
3. 防抖：筛选操作 300ms 防抖

## 错误处理

- 数据加载失败：显示重试按钮
- 空数据：显示"暂无关系数据"提示
- 渲染错误：降级到列表视图

## 可访问性

- 键盘导航：Tab 切换节点
- 屏幕阅读器：提供文本描述
- 颜色对比：符合 WCAG AA 标准

## 参考

- 技术实现标准：`.trellis/spec/frontend/`
- API 规范：`.trellis/spec/backend/api-response-standard.md`
