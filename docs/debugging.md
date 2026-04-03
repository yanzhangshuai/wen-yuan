# Debugging Guide (Next.js Dev)

## Script Naming

This project uses `namespace:verb` style for scoped scripts.
For dev debugger entrypoint, use:

- `dev:debug`: run `next dev` with Node inspector enabled (`9229` bootstrap, app debugger typically `9229`)

## CLI Usage

Start debugger-enabled dev server:

```bash
pnpm dev:debug
```

## VSCode Usage

Use `.vscode/launch.json`:

- `Next.js: Launch Dev Debug`: starts `pnpm dev:debug` inside VSCode terminal
- `Next.js: Attach (9230)`: attaches to the running Next.js app debugger port (`9230`)

Typical flow:

1. Run `Next.js: Launch Dev Debug`
2. Set breakpoints in server-side code (API routes, server modules)
3. If needed, run `Next.js: Attach (9230)` to attach manually
