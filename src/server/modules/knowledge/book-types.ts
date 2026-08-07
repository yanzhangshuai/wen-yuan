/**
 * 书籍类型 CRUD 服务。
 *
 * v5 阶段 1（08-07-v5-skill-loading）：book_types 表已删，书型间接层被 skill 契约取代。
 * 本模块仅保留导出签名以兼容 API 路由编译；运行时一律抛错，管理端页面在阶段 5 删除。
 */

/** 书籍类型行（保留形状仅供 API 路由编译，实际不再有数据）。 */
export interface BookTypeRow {
  id         : string;
  key        : string;
  name       : string;
  description: string | null;
  isActive   : boolean;
  sortOrder  : number;
}

/** 列出所有书籍类型（管理端：含未激活）。 */
export function listBookTypes(_params?: { active?: boolean }): Promise<BookTypeRow[]> {
  return Promise.reject(new Error("book_types 表已删除（v5），书籍类型功能由 skill 契约取代"));
}

/** 列出启用的书籍类型（公开接口：导入页下拉）。 */
export function listActiveBookTypes(): Promise<BookTypeRow[]> {
  return Promise.reject(new Error("book_types 表已删除（v5），书籍类型功能由 skill 契约取代"));
}

/** 获取单个书籍类型详情。 */
export function getBookType(_id: string): Promise<BookTypeRow | null> {
  return Promise.reject(new Error("book_types 表已删除（v5），书籍类型功能由 skill 契约取代"));
}

/** 创建书籍类型。 */
export function createBookType(_data: {
  key         : string;
  name        : string;
  description?: string;
  sortOrder?  : number;
}): Promise<BookTypeRow> {
  return Promise.reject(new Error("book_types 表已删除（v5），书籍类型功能由 skill 契约取代"));
}

/** 更新书籍类型。 */
export function updateBookType(
  _id: string,
  _data: {
    key?        : string;
    name?       : string;
    description?: string;
    sortOrder?  : number;
    isActive?   : boolean;
  }
): Promise<BookTypeRow> {
  return Promise.reject(new Error("book_types 表已删除（v5），书籍类型功能由 skill 契约取代"));
}

/** 删除书籍类型（检查关联）。 */
export function deleteBookType(_id: string): Promise<BookTypeRow> {
  return Promise.reject(new Error("book_types 表已删除（v5），书籍类型功能由 skill 契约取代"));
}
