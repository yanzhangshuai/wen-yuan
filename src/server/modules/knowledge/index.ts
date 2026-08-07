/**
 * 知识库模块入口（v5 精简后）。
 *
 * v5 架构：旧知识系统（书籍类型/提示词模板/别名包/提取规则/知识包/关系类型定义）已被
 * Skill 契约取代并删除，本模块只保留仍在用的：变更日志、审计、关系码名查询。
 */

export { listChangeLogs, getChangeLog } from "./change-logs";

export { auditLog } from "./audit";

export { lookupRelationshipTypeNames } from "./lookupTypeNames";
