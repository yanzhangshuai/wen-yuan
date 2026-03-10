#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Session Start Hook - Inject structured context
"""

# IMPORTANT: Suppress all warnings FIRST
import warnings
warnings.filterwarnings("ignore")

import json
import os
import subprocess
import sys
from io import StringIO
from pathlib import Path

# IMPORTANT: Force stdout to use UTF-8 on Windows
# This fixes UnicodeEncodeError when outputting non-ASCII characters
if sys.platform == "win32":
    import io as _io
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    elif hasattr(sys.stdout, "detach"):
        sys.stdout = _io.TextIOWrapper(sys.stdout.detach(), encoding="utf-8", errors="replace")  # type: ignore[union-attr]


def should_skip_injection() -> bool:
    return (
        os.environ.get("CLAUDE_NON_INTERACTIVE") == "1"
        or os.environ.get("OPENCODE_NON_INTERACTIVE") == "1"
    )


def read_file(path: Path, fallback: str = "") -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return fallback


def run_script(script_path: Path) -> str:
    try:
        if script_path.suffix == ".py":
            # Add PYTHONIOENCODING to force UTF-8 in subprocess
            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            cmd = [sys.executable, "-W", "ignore", str(script_path)]
        else:
            env = os.environ
            cmd = [str(script_path)]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=5,
            cwd=script_path.parent.parent.parent,
            env=env,
        )
        return result.stdout if result.returncode == 0 else "No context available"
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        return "No context available"


def main():
    if should_skip_injection():
        sys.exit(0)

    project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")).resolve()
    trellis_dir = project_dir / ".trellis"

    output = StringIO()

    # Inject current state (lightweight, from get_context.py)
    output.write("<current-state>\n")
    context_script = trellis_dir / "scripts" / "get_context.py"
    output.write(run_script(context_script))
    output.write("\n</current-state>\n\n")

    # Inject slim guide instead of full workflow + guidelines + instructions
    output.write("""<instructions>
You are an AI dev assistant in a Trellis-managed project.

## Core Rules
- Run `python3 .trellis/scripts/get_context.py` to understand project state.
- Only read specs listed under ACTIVE SPECS in the context output above.
- Before coding, read the relevant spec files with `cat .trellis/spec/<type>/<file>.md`.
- Do NOT execute `git commit` — leave that to the human.
- Use `python3 .trellis/scripts/task.py list` to manage tasks.

## Stage System
This project uses stage-based spec activation (mvp → growth → mature).
- View stage: `python3 .trellis/scripts/get_stage.py`
- List active specs: `python3 .trellis/scripts/list_specs.py`
- Change stage: `python3 .trellis/scripts/set_stage.py <stage>`

## On-Demand References (read when needed, not preloaded)
- Full workflow: `cat .trellis/workflow.md`
- Frontend specs: `cat .trellis/spec/frontend/index.md`
- Backend specs: `cat .trellis/spec/backend/index.md`
- Thinking guides: `cat .trellis/spec/guides/index.md`
- Task workflow: `/trellis:start`

## Slash Commands
- `/trellis:start` — Full start session workflow
- `/trellis:brainstorm` — Requirements discovery
- `/trellis:finish-work` — Pre-commit checklist
- `/trellis:record-session` — Record completed session
- `/trellis:check-frontend` / `/trellis:check-backend` — Code quality check
</instructions>

<ready>
Context loaded. Wait for user's first message, then handle their request.
Read specs on-demand — they are NOT preloaded into context.
</ready>""")

    result = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": output.getvalue(),
        }
    }

    # Output JSON - stdout is already configured for UTF-8
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
