/**
 * 文件定位（服务层：书籍类型代码更新）
 * - `src/server/modules/books/updateBookTypeCode.ts`
 * - 对应 `PATCH /api/admin/books/:id` 路由的 `typeCode` 更新职责。
 *
 * 业务语义：
 * - 仅更新 `Book.typeCode`（三阶段管线的 BookType 分类）；
 * - 不触碰 `bookTypeId`（知识库域的结构化类型），两者语义独立（详见 schema 注释）。
 *
 * 协作关系：
 * - 上游：Admin PATCH Route Handler（鉴权 + 请求体校验后调用）；
 * - 下游：Prisma `book.update`；
 * - 失败分支：书籍不存在时抛 `BookNotFoundError`，由 Route 层映射 404。
 */

import type { BookTypeCode } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 更新后返回的最小 DTO。
 * - 只暴露与 BookType 切换相关的字段，避免把完整书籍聚合纳入该 API；
 * - 前端需要完整详情时应调用 `GET /api/admin/books/:id` 或列表接口刷新。
 */
export interface UpdatedBookTypeCode {
  /** 书籍主键。 */
  id       : string;
  /** 书名（便于前端提示 toast）。 */
  title    : string;
  /** 更新后的 BookType 枚举值。 */
  typeCode : BookTypeCode;
  /** 更新时间（ISO 字符串）。 */
  updatedAt: string;
}

/**
 * 功能：创建 `updateBookTypeCode` 服务闭包（便于测试注入 Prisma）。
 * 输入：`prismaClient`（默认全局单例）。
 * 输出：`{ updateBookTypeCode }`。
 * 异常：无（内部函数按实体存在性抛 `BookNotFoundError`）。
 * 副作用：无。
 */
export function createUpdateBookTypeCodeService(prismaClient: PrismaClient = prisma) {
  /**
   * 功能：把目标书籍的 `typeCode` 更新为指定枚举值。
   * 输入：
   *   - `bookId: string` 书籍主键；
   *   - `typeCode: BookTypeCode` 新的 BookType 枚举值（Route 层已校验合法性）。
   * 输出：`UpdatedBookTypeCode`。
   * 异常：
   *   - `BookNotFoundError`：目标书籍不存在或已软删除；
   *   - 其他：Prisma 写入异常由调用方兜底。
   * 副作用：更新 `books.type_code` + `books.updated_at`。
   */
  async function updateBookTypeCode(bookId: string, typeCode: BookTypeCode): Promise<UpdatedBookTypeCode> {
    // 先校验书籍是否存在（未被软删除），避免 update 成功但目标实际应为 404 的语义漂移。
    const existing = await prismaClient.book.findFirst({
      where : { id: bookId, deletedAt: null },
      select: { id: true }
    });

    if (!existing) {
      throw new BookNotFoundError(bookId);
    }

    const updated = await prismaClient.book.update({
      where : { id: bookId },
      data  : { typeCode },
      select: {
        id       : true,
        title    : true,
        typeCode : true,
        updatedAt: true
      }
    });

    return {
      id       : updated.id,
      title    : updated.title,
      typeCode : updated.typeCode,
      updatedAt: updated.updatedAt.toISOString()
    };
  }

  return { updateBookTypeCode };
}

export const { updateBookTypeCode } = createUpdateBookTypeCodeService();
