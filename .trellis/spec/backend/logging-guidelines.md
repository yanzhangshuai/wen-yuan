# Logging Guidelines

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/logging-guidelines.md
> Mirror: .trellis/spec/backend/logging-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## Current Pattern

Long-running analysis service logs structured events with stable event names.

## Required Patterns

- Use machine-searchable event IDs (e.g. `analysis.start`).
- Include primary IDs (`chapterId`, `bookId`, etc.) in payload.
- Log hallucination/filter decisions when AI output is dropped.

## Existing References

- `src/server/modules/analysis/services/ChapterAnalysisService.ts`

## Anti-Patterns

- Free-form logs without identifiers.
- Logging sensitive payloads directly.
