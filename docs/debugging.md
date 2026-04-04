# Debugging Guide (Next.js Dev)

## VSCode Usage

Use `.vscode/launch.json`:

- `Next.js: Client Debug`: client/browser debugging
- `Next.js: Node API Debug`: server API debugging

Both configs have a `preLaunchTask` that automatically clears stale `next dev` process for this workspace.

Typical flow (client code, e.g. `src/lib/services/models.ts`):

1. Run `Next.js: Client Debug`
2. Wait for browser auto-open (it will follow Next actual local URL, not fixed 3000)
3. Put breakpoint or `debugger;` in client file
4. Trigger UI action

Typical flow (API/server code):

1. Run `Next.js: Node API Debug`
2. Set breakpoints in server-side code (API routes, server modules)
3. Trigger the API request
4. Debugger will auto-attach internally to port `9229`

`Next.js: Node API Debug` starts:

```bash
pnpm exec next dev --inspect=9229 --webpack
```

This avoids relying on extra `package.json` debug scripts and reduces child-process debugger mismatch.

## CLI Usage (Optional)

If you want to run manually in terminal:

```bash
pnpm exec next dev --inspect=9229 --webpack
```

Then run `Next.js: Node API Debug` in VSCode.

## API Breakpoint Notes

- If your route exports `runtime = 'edge'`, Node debugger will not stop there.
- For API debugging, prefer Node runtime routes:

```ts
export const runtime = 'nodejs'
```

- Add a temporary `debugger;` in the route handler to confirm attach status quickly.

Do not manually run another `next dev` in parallel, or you may hit `.next/dev/lock` and debugger port conflicts.
