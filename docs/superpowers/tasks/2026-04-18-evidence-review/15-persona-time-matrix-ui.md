# T15: Persona x Time Review Matrix UI

## Goal

Build the `persona x time` review view for works such as `三国演义`, where time may be a historical stage, battle phase, relative phase, chapter order, uncertain label, or year.

## Main Context

- Spec sections: §5.2, §5.3, §7.7, §8.2, §13.2, §15
- Upstream dependencies: T11, T12, T14, T16, T21 sample data

## Files

- Create: `src/components/review/persona-time-matrix/**`
- Modify/Create: `src/app/admin/review/**`
- Create: `src/components/review/persona-time-matrix/*.test.tsx`

## Do Not Do

- Do not force imprecise time expressions into exact years.
- Do not duplicate all persona-chapter matrix interactions.
- Do not detach time facts from chapter evidence.

## Execution Checkpoints

- [ ] Define supported time axis types: `CHAPTER_ORDER`, `RELATIVE_PHASE`, `NAMED_EVENT`, `HISTORICAL_YEAR`, `BATTLE_PHASE`, and `UNCERTAIN`.
- [ ] Load persona-time projection summaries from T11/T12.
- [ ] Implement hierarchical time-axis display with collapsed defaults.
- [ ] Display events, relations, conflict flags, and time claims within selected time cells.
- [ ] Support editing time normalization, event attribution, and time-slice association through T12.
- [ ] Implement stable navigation between time cells and linked chapter facts.
- [ ] Add filtering and jump controls suitable for long works such as `三国演义`.
- [ ] Integrate evidence/audit side panel from T16.
- [ ] Add tests for time filtering, cell drill-down, chapter back-link, imprecise time preservation, and edit flow.
- [ ] Add an execution record and mark T15 complete in the runbook only after validation passes.

## Validation

```bash
pnpm test src/components/review/persona-time-matrix
pnpm type-check
pnpm lint
```

## Acceptance Criteria

- [ ] Reviewer can review events, relations, and time normalization by persona/time slice.
- [ ] Time slices and chapter facts have stable two-way navigation.
- [ ] Imprecise time expressions retain raw and normalized labels.
- [ ] `三国演义` samples can validate relation dynamics and historical phases.

## Stop Conditions

- Stop if time-slice schema cannot represent the six required time axis types.
- Stop if `三国演义` sample data is unavailable for validation.
- Stop if time UI navigation needs a product decision.

## Execution Record

No execution recorded yet.

