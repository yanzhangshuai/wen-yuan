# T13: Persona x Chapter Review Matrix UI

## Goal

Build the main review entry for `persona x chapter`, allowing reviewers to inspect and edit a person's chapter facts with evidence, AI basis, statuses, and audit history.

## Main Context

- Spec sections: §5.3, §7.7, §8.1, §15
- Upstream dependencies: T11, T12, T16 can be stubbed if not complete but must be integrated later

## Files

- Modify/Create: `src/app/admin/review/**`
- Create: `src/components/review/persona-chapter-matrix/**`
- Create: `src/components/review/shared/**`
- Create: `src/app/admin/review/**/*.test.tsx`

## Do Not Do

- Do not expose raw claim table complexity to reviewers.
- Do not load all full-book claim detail into the first screen.
- Do not read legacy draft truth objects for the main matrix.

## Execution Checkpoints

- [ ] Inspect existing admin review page routing and component patterns.
- [ ] Define matrix DTO usage from T12 and projection summaries from T11.
- [ ] Implement matrix layout with persons as horizontal axis and chapters as vertical axis.
- [ ] Show cell summary: event count, relation count, conflict count, review status summary, and latest updated timestamp.
- [ ] Implement filters for persona, chapter jump, status, and conflict state.
- [ ] Implement cell drill-down to claim list for a selected persona/chapter.
- [ ] Support create, edit, reject/delete, defer/status mark, and evidence viewing through T12 APIs.
- [ ] Integrate evidence/audit side panel from T16 if available; otherwise create a temporary adapter that must be replaced in T16.
- [ ] Add virtualization or equivalent performance handling for 50+ personas and 100+ chapters.
- [ ] Add page/component tests for loading, filtering, drill-down, edit flow, and evidence opening.
- [ ] Add an execution record and mark T13 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/app/admin/review
pnpm type-check
pnpm lint
```

## Acceptance Criteria

- [ ] Reviewer can enter any persona/chapter cell and revise facts.
- [ ] Cell summaries and drill-down details use the same projection/query semantics.
- [ ] Evidence and AI basis are visible in the review path.
- [ ] Large matrices remain usable.

## Stop Conditions

- Stop if the admin UI framework has no stable route for the new review entry.
- Stop if virtualized matrix design needs a product decision.
- Stop if T12 APIs are missing DTOs required for a usable drill-down.

## Execution Record

No execution recorded yet.

