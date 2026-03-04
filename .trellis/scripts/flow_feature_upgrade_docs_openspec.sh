#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT_DIR}" ]]; then
  echo "[flow-feature-upgrade-openspec] Not inside a git repository." >&2
  exit 1
fi
cd "${ROOT_DIR}"

TASK_DIR_INPUT="${1:-}"
if [[ -n "${TASK_DIR_INPUT}" ]]; then
  TASK_DIR="${TASK_DIR_INPUT}"
else
  if [[ ! -f .trellis/.current-task ]]; then
    echo "[flow-feature-upgrade-openspec] Missing .trellis/.current-task, please pass task-dir." >&2
    exit 1
  fi
  TASK_DIR="$(cat .trellis/.current-task)"
fi

if [[ ! -d "${TASK_DIR}" ]]; then
  echo "[flow-feature-upgrade-openspec] Task directory not found: ${TASK_DIR}" >&2
  exit 1
fi

REQ="$(python3 - "${TASK_DIR}/task.json" <<'PY'
import json
import pathlib
import sys
p = pathlib.Path(sys.argv[1])
if not p.exists():
    print("flow-feature strict upgrade")
    raise SystemExit(0)
try:
    data = json.loads(p.read_text(encoding="utf-8"))
except Exception:
    data = {}
print((data.get("title") or data.get("description") or "flow-feature strict upgrade").strip())
PY
)"

bash .trellis/scripts/flow_feature_init_openspec.sh --strategy strict --task-dir "${TASK_DIR}" "${REQ}"

echo "[flow-feature-upgrade-openspec] Upgrade patch applied"
echo "  task: ${TASK_DIR}"
