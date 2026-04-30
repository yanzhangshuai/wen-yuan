# 角色资料工作台章节事迹与角色管理契约

> 记录角色资料工作台按章节校验角色事迹、维护当前书籍角色、删除角色前预览级联影响的跨层契约。

## Scenario: 章节事迹工作台与角色管理

### 1. Scope / Trigger

- Trigger: 新增角色资料工作台 `章节事迹` 与 `角色管理` 能力，涉及 Next.js API、Prisma service、前端 service contract、数据库迁移。
- Scope: 仅基于已落库业务表工作，不改变 AI 解析输出结构、prompt、sequential/twopass 管线中间产物。
- Data source: sequential 与 twopass 最终都写入 `Persona`、`Profile`、`BiographyRecord`、`Mention`、`Relationship`、`Chapter`，角色资料工作台必须读取这些统一业务表。

### 2. Signatures

- `GET /api/admin/role-workbench/books/:bookId/chapter-events`
  - query: `chapterId?`, `status?`, `source?`
  - returns: chapter summaries, event list, active personas for the book.
- `POST /api/admin/role-workbench/books/:bookId/chapter-events`
  - body: manual biography record payload.
  - creates `BiographyRecord` as `status=VERIFIED`, `recordSource=MANUAL`.
- `PATCH /api/admin/role-workbench/books/:bookId/chapter-events/:eventId`
  - body: partial biography record payload.
  - may move event to another chapter and must keep `chapterNo` consistent with `chapterId`.
- `DELETE /api/admin/role-workbench/books/:bookId/chapter-events/:eventId`
  - soft deletes one biography record from the current book scope.
- `POST /api/admin/role-workbench/books/:bookId/chapter-events/verify`
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
  - biography records, relationships, and mentions in that book scope are soft deleted and removed from visible workbench/graph data;
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

- Good: A chapter with no events still appears in the chapter list and can be marked verified after manual confirmation.
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
  - new tabs render in the role workbench panel;
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

## Scenario: 角色为中心的资料工作台

### 1. Scope / Trigger

- Trigger: 角色资料工作台新增 `角色资料` 工作区，前端需要在一个角色上下文内展示基础资料、关系、传记事件和别名映射。
- Scope: 不新增数据库 schema，不改变 AI 分析管线；优先复用已存在的 persona、relationship、biography、alias API。
- Data source: 当前角色工作区必须以 `GET /api/personas/:id` 详情为主数据源，`GET /api/admin/drafts` 只用于待确认计数和详情加载失败时的回退。

### 2. Signatures

- `GET /api/books/:bookId/personas`
  - returns: current book persona list used by the role sidebar.
- `GET /api/personas/:id`
  - returns: persona fields, current-book profile, relationships, timeline/biography records.
- `PATCH /api/personas/:id?bookId=:bookId`
  - updates persona and current-book profile fields.
- `GET /api/personas/:id/delete-preview?bookId=:bookId`
  - returns scoped cascade preview before deletion.
- `DELETE /api/personas/:id?bookId=:bookId`
  - performs scoped soft delete after preview confirmation.
- `POST /api/books/:bookId/relationships`
  - body: `{ chapterId, sourceId, targetId, type, weight?, description?, evidence?, confidence? }`.
  - MVP role workbench creates only outgoing edges where `sourceId` is the selected persona.
- `PATCH /api/relationships/:id`
  - body: partial relationship fields, including optional `status`.
- `POST /api/personas/:id/biography`
  - body: `{ chapterId, category?, title?, location?, event, virtualYear? }`.
- `PATCH /api/biography/:id`
  - body: partial biography fields, including optional `status` and `chapterId`.
- `DELETE /api/biography/:id`
  - soft deletes one biography record.

### 3. Contracts

- Top-level role workbench tabs:
  - `角色资料` is the default entry;
  - legacy `角色管理`, `关系草稿`, and `传记事件` must not remain as primary top-level entries;
  - `章节事迹`, `合并建议`, `别名映射`, and `自检报告` remain global views.
- Role sidebar:
  - list source is book personas;
  - search covers canonical name, book display name, aliases, and tags where available;
  - default ordering is first appearance chapter, derived from relationship drafts, biography drafts, and alias chapter ranges when the persona list does not expose a dedicated first-appearance field;
  - personas with unknown first appearance sort after personas with known chapters, with name as the stable tie-breaker;
  - pending counts are aggregated from drafts/alias mappings, not from persona detail alone.
  - left/right split panes must be height-bounded to the viewport and use independent scroll containers; scrolling the role list must not scroll the workspace content.
- Role workspace:
  - relationships and biographies are read from persona detail first so `VERIFIED`, `REJECTED`, and manual records remain visible after confirmation/rejection actions;
  - drafts can only be a fallback, because drafts intentionally omit non-draft records;
  - any create/edit/verify/reject/delete action touching relationships or biographies must refresh persona detail and the aggregate drafts list.
- Role edit surfaces:
  - persona create/edit uses an in-workspace inline editor in the `基础资料` area, not the right-side sheet, so role profile editing stays visually anchored to the selected role;
  - relationship, biography, and alias create/edit may continue to use the right-side sheet;
  - if the workbench supports switching roles while a sheet is dirty, the sheet must not use a blocking modal overlay that prevents the role switch trigger from being clicked;
  - close/cancel and role-switch paths must share the same dirty confirmation behavior instead of protecting only the close button path;
  - create/edit forms must validate required fields before sending requests and show inline feedback when blocked.
  - chapter inputs must be human-readable chapter selectors, not raw `chapterId` text fields; the saved payload still sends `chapterId`.
  - persona create/edit must allow setting an explicit first-appearance chapter on the book profile; role sidebar appearance sorting uses this explicit chapter first, then falls back to inferred draft/alias appearances.
  - relationship target selection must support searching by canonical name, book display name, and aliases, and long option lists must be height-limited with internal scrolling.
- Relationship direction:
  - outgoing edges display as `current persona -> other persona`;
  - incoming edges display as `other persona -> current persona`;
  - editing an incoming edge must make clear that the stored edge direction is owned by the other persona.
- Delete contract:
  - persona deletion UI must fetch delete-preview first;
  - direct delete without preview confirmation is invalid.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| persona detail request fails | keep the workspace usable with draft fallback and visible error/loading state where appropriate |
| confirmed/manual relationship is absent from drafts | still display it from persona detail |
| confirmed/manual biography is absent from drafts | still display it from persona detail |
| relationship create target is missing | block submit in the UI before request |
| biography create has no chapter or event body | block submit in the UI before request |
| relationship/biography create form exposes raw chapter UUID input | replace with chapter selector that displays chapter number/title and submits `chapterId` |
| relationship target list is long | provide searchable selector with bounded internal scroll |
| role sidebar has more rows than viewport | keep workbench height bounded and scroll sidebar/workspace independently |
| role list has known appearance chapters | default sort by earliest appearance chapter, not by name |
| role profile has explicit first-appearance chapter | use explicit chapter for appearance sort before inferred draft/alias chapters |
| persona create/edit is opened | render an inline editor in the workspace basics area rather than a right-side sheet |
| user switches role or closes a dirty sheet | require confirmation before discarding local edits |
| sheet overlay blocks role switching while dirty guard claims to support it | use a non-blocking sheet mode or remove that interaction path |
| delete-preview fails | do not enable destructive delete confirmation |

### 5. Good/Base/Bad Cases

- Good: Confirming a pending relationship updates its status and it remains visible in the selected role's relationship section.
- Good: Manually creating a biography record adds a verified/manual timeline item that remains visible after the drafts list refreshes.
- Base: Pending counts decrease after verification, while the underlying record remains visible through persona detail.
- Base: If persona detail is temporarily unavailable, draft relationships/biographies still provide a degraded workbench view.
- Bad: Filtering the role workspace only from `fetchDrafts` makes confirmed or manually created records disappear immediately after a successful action.
- Bad: An incoming relationship is rendered as if the selected persona were the source, hiding the true stored edge direction.

### 6. Tests Required

- Frontend component tests:
  - role workbench panel defaults to `角色资料` and no longer exposes legacy primary role/relationship/biography tabs;
  - role sidebar search/filter/sort selects the correct persona;
  - role sidebar defaults to first-appearance ordering;
  - pending relationship, biography, and alias counts are shown per persona;
  - outgoing and incoming relationship directions render distinctly;
  - non-draft relationship/biography records from persona detail remain visible;
  - role sidebar and workspace have independent scroll containers;
  - persona create/edit renders inside the workspace rather than the side sheet;
  - persona create/edit can set first-appearance chapter and sorting prefers the explicit value;
  - relationship and biography create forms render chapter selectors rather than `章节 ID` text inputs;
  - relationship create target selector is searchable and height-limited;
  - dirty sheet close or role switch asks for confirmation;
  - persona delete requires preview before confirmation.
- Service/route tests where wrappers change:
  - relationship create request uses book-scoped POST payload;
  - biography create and delete wrappers call the expected endpoints;
  - PATCH wrappers support status updates without requiring a full entity payload.

### 7. Wrong vs Correct

#### Wrong

```tsx
// Drafts are not a full entity history; verified records disappear from this view.
const visibleRelationships = drafts.relationships.filter((relationship) => {
  return relationship.sourcePersonaId === personaId || relationship.targetPersonaId === personaId;
});
```

#### Correct

```tsx
// Persona detail is the canonical role-context view; drafts are only count/fallback data.
const detail = await fetchPersonaDetail(personaId);
const visibleRelationships = detail.relationships;
```
