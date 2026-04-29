# 审核中心章节事迹与角色管理契约

> 记录审核中心按章节校验角色事迹、维护当前书籍角色、删除角色前预览级联影响的跨层契约。

## Scenario: 章节事迹工作台与角色管理

### 1. Scope / Trigger

- Trigger: 新增审核中心 `章节事迹` 与 `角色管理` 能力，涉及 Next.js API、Prisma service、前端 service contract、数据库迁移。
- Scope: 仅基于已落库业务表工作，不改变 AI 解析输出结构、prompt、sequential/twopass 管线中间产物。
- Data source: sequential 与 twopass 最终都写入 `Persona`、`Profile`、`BiographyRecord`、`Mention`、`Relationship`、`Chapter`，审核中心必须读取这些统一业务表。

### 2. Signatures

- `GET /api/admin/review/books/:bookId/chapter-events`
  - query: `chapterId?`, `status?`, `source?`
  - returns: chapter summaries, event list, active personas for the book.
- `POST /api/admin/review/books/:bookId/chapter-events`
  - body: manual biography record payload.
  - creates `BiographyRecord` as `status=VERIFIED`, `recordSource=MANUAL`.
- `PATCH /api/admin/review/books/:bookId/chapter-events/:eventId`
  - body: partial biography record payload.
  - may move event to another chapter and must keep `chapterNo` consistent with `chapterId`.
- `DELETE /api/admin/review/books/:bookId/chapter-events/:eventId`
  - soft deletes one biography record from the current book scope.
- `POST /api/admin/review/books/:bookId/chapter-events/verify`
  - body: `{ chapterId: string }`.
  - creates/updates `chapter_biography_verifications`.
- `GET /api/personas/:id/delete-preview?bookId=:bookId`
  - returns cascade counts and expandable details.
- `DELETE /api/personas/:id?bookId=:bookId`
  - performs cascade soft delete using the same scope rules as preview.
- `PATCH /api/personas/:id`
  - may update persona fields and current-book `Profile` fields when `bookId` is supplied.
- DB: `chapter_biography_verifications(chapter_id, book_id, verified_by, verified_at, updated_at)`.
  - `id` must keep database default `gen_random_uuid()`.
  - `updated_at` must keep database default `CURRENT_TIMESTAMP`.

### 3. Contracts

- Chapter summary must include:
  - chapter identity and display fields;
  - total event count;
  - pending event count;
  - chapter biography verification state.
- Event response must include:
  - `id`, `personaId`, persona display name;
  - `chapterId`, `chapterNo`;
  - `category`, `title`, `location`, `virtualYear`, `event`, `ironyNote`;
  - `status`, `recordSource`, timestamps.
- Role deletion preview must include:
  - counts for relationships, biographies, mentions, profiles;
  - detail lists with chapter labels for user confirmation.
- Soft-delete contract:
  - deleting a persona in book scope soft deletes its profile for that book;
  - biography records, relationships, and mentions in that book scope are soft deleted and removed from visible review/graph data;
  - preview and delete must share the same filtering helper to prevent drift.
- Verification contract:
  - chapter verification means only “该章节角色事迹已人工校验”;
  - it does not imply relationship, mention, alias, or full chapter verification.
- Migration contract:
  - migrations touching `chapter_biography_verifications` must preserve Prisma schema defaults for `id` and `updated_at`;
  - if an earlier migration accidentally drops those defaults, add a forward migration to restore them instead of editing an already-applied migration.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| caller is not admin | return auth error through `failJson` |
| `bookId`, `chapterId`, `personaId`, or `eventId` is invalid | Zod validation error |
| chapter does not belong to `bookId` | reject request |
| persona/profile does not belong to current book when creating or moving an event | reject request |
| marking a chapter verified while pending biography drafts remain | reject request with a clear business error |
| deleting a missing or already deleted persona/event | not found error |
| role delete preview omits `bookId` | preview global persona cascade scope only when explicitly supported by service caller |

### 5. Good/Base/Bad Cases

- Good: A chapter with no events still appears in the chapter list and can be marked verified after review.
- Good: A manually added event appears immediately as verified/manual and is visible in the chapter workbench.
- Good: A follow-up migration restores `chapter_biography_verifications.id` and `updated_at` defaults after a drift is found.
- Base: Editing an event within the same chapter updates display fields and refreshes the active chapter.
- Base: Moving an event to another chapter updates both `chapterId` and `chapterNo`.
- Bad: A migration leaves `id` without `gen_random_uuid()` or `updated_at` without `CURRENT_TIMESTAMP` while `schema.prisma` still declares those defaults.
- Bad: UI calls delete persona without fetching preview first. The role-management UI must require preview confirmation.
- Bad: Preview counts use one `where` clause while delete uses another. Keep the shared scope helper as the single rule source.

### 6. Tests Required

- Service tests:
  - chapter event listing includes chapter summaries and verification state;
  - manual event creation sets `VERIFIED` + `MANUAL`;
  - event update can move chapter and sync `chapterNo`;
  - chapter verification blocks when pending drafts exist;
  - delete preview and cascade delete count the same records.
- Route tests where practical:
  - Zod validation failures;
  - auth/permission handling;
  - success envelope codes and HTTP statuses.
- Frontend tests where project patterns allow:
  - new tabs render in review panel;
  - chapter event cards expose role, status/source, chapter context, and event body;
  - role deletion confirmation cannot execute before preview loads.

### 7. Wrong vs Correct

#### Wrong

```ts
// Preview and delete drift because each path invents its own filters.
const previewCount = await prisma.biographyRecord.count({ where: { personaId } });
await prisma.biographyRecord.updateMany({
  where: { personaId, chapter: { bookId } },
  data: { deletedAt: new Date() }
});
```

#### Correct

```ts
// Use one scoped helper for preview and delete so confirmation matches execution.
const where = scopedCascadeWhere(personaId, { bookId });
const previewCount = await prisma.biographyRecord.count({ where: where.biographies });
await tx.biographyRecord.updateMany({
  where: where.biographies,
  data: { status: "REJECTED", deletedAt: now }
});
```
