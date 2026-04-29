# Technical Design Notes

## Scope

Implement the review-center character-event management feature described in `prd.md`.

The feature should operate on persisted business data, not analysis-pipeline intermediate JSON. It must support both sequential and two-pass parsed books because both ultimately write to the same `Persona`, `Profile`, `BiographyRecord`, `Mention`, `Relationship`, and `Chapter` tables.

## Backend Shape

* Add a persisted chapter character-event verification state. Prefer a new Prisma model/table with clear semantics rather than overloading `Chapter` or `BiographyRecord`.
* Add/query review data by book and chapter:
  * chapter list with event counts, pending counts, and verification state;
  * current chapter content;
  * current chapter character events including persona, status, source, category, title, location, virtual year, event, and notes.
* Preserve existing biography CRUD where useful, but extend or add services/routes when chapter workbench needs:
  * list events by chapter and filters;
  * create manual event as `recordSource=MANUAL`, `status=VERIFIED`;
  * update event persona, chapter, category, title, location, virtual year, event, and note fields;
  * soft-delete/reject event.
* Add role-management services/routes for current-book personas and profiles:
  * list all active current-book personas;
  * create persona + current-book profile;
  * update persona basics + profile fields;
  * confirm/reject AI draft personas where existing review status supports it;
  * deletion preview with counts and expandable details for biographies, relationships, mentions;
  * confirmed deletion as cascading soft delete for persona-related visible data.
* Deletion preview and actual deletion must use the same filtering rules to avoid preview/execute drift.
* Do not change AI parsing output, prompts, or pipeline architecture.

## Frontend Shape

* Add an independent `章节事迹` tab to `ReviewPanel`; keep the existing `传记事件` tab.
* Add an independent `角色管理` tab to `ReviewPanel`.
* Chapter workbench layout:
  * left chapter list with chapter title, event count, pending count, and verification status;
  * desktop content area split into chapter source text and character-event cards/edit area;
  * responsive fallback can stack sections on narrow screens.
* Event cards should clearly show persona name, category, title/identity, location, virtual year, event body, status, and source.
* Event create/edit should use a drawer or similarly clear independent form area. Required fields include persona, chapter, category, title/identity, location, virtual year, event body, and note.
* Empty chapters should show a clear empty state and an add-event action.
* Save actions should refresh the active chapter list immediately. If an event moves chapters, it should disappear from the old chapter and appear under the new chapter.

## Testing Focus

* Backend service and route tests for:
  * chapter event listing;
  * chapter verification state persistence and pending-draft blocking;
  * manual event creation as verified/manual;
  * event chapter move and redundant `chapterNo` update;
  * persona/profile create and update;
  * deletion preview and cascading soft delete consistency.
* Frontend tests should cover key user-visible behavior where project patterns make that practical:
  * tabs render;
  * chapter event cards show the important fields;
  * pending events block marking a chapter as verified;
  * edit/save refresh flows call the intended services.

## Risks

* The role deletion cascade can affect graph data. Keep it transactional and use soft-delete semantics consistent with existing modules.
* The feature is broad. Favor cohesive service modules and focused UI components over expanding `review-panel.tsx` into one large file.
* Existing APIs may not expose full profile fields. Extend contracts deliberately and update frontend service types together.
