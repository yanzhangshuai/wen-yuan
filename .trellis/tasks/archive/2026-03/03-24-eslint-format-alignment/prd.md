# ESLint format alignment

## Goal
Align the current project's ESLint setup with the useful formatting and alignment ideas from `/home/mwjz/code/web/presentation-ai/eslint.config.js`, while preserving this repository's existing coding style.

## Requirements
- Keep the current Next.js Core Web Vitals baseline.
- Add formatting-focused ESLint rules that improve object/property alignment and spacing consistency.
- Do not introduce Vue-specific rules or force a semicolon style that conflicts with the current codebase.
- Keep generated code excluded from linting and extend ignores only where it helps reduce lint noise.

## Acceptance Criteria
- [ ] `eslint.config.mjs` includes formatting/alignment rules adapted from the reference config.
- [ ] The updated rules are compatible with the repository's current semicolon-based style.
- [ ] The change stays scoped to ESLint configuration and related metadata only.
- [ ] Verification status and any environment limits are documented in the final report.

## Technical Notes
- The environment currently does not expose `node`, `npm`, or `pnpm` on PATH, so Node-based lint verification may not be runnable inside this session.
- Prefer ESLint core rules already available through the existing toolchain to avoid adding install-only dependencies that cannot be verified here.
