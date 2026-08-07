/**
 * 知识库模块入口（v5 精简后）。
 *
 * v5 架构：旧知识系统（prompt-templates/别名包/提取规则/知识包/旧关系类型定义）已被
 * Skill + relationship_types 取代，本模块只保留仍在用的：书籍类型、变更日志、审计、关系码名查询。
 */

export {
  listBookTypes,
  listActiveBookTypes,
  getBookType,
  createBookType,
  updateBookType,
  deleteBookType,
} from "./book-types";

export { listChangeLogs, getChangeLog } from "./change-logs";

export { auditLog } from "./audit";

export { lookupRelationshipTypeNames } from "./lookupTypeNames";
