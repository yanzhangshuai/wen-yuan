#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT_DIR}" ]]; then
  echo "[flow-feature-upgrade-docs] Not inside a git repository." >&2
  exit 1
fi
cd "${ROOT_DIR}"

TASK_DIR_INPUT="${1:-}"
if [[ -n "${TASK_DIR_INPUT}" ]]; then
  TASK_DIR="${TASK_DIR_INPUT}"
else
  if [[ ! -f .trellis/.current-task ]]; then
    echo "[flow-feature-upgrade-docs] Missing .trellis/.current-task, please pass task-dir." >&2
    exit 1
  fi
  TASK_DIR="$(cat .trellis/.current-task)"
fi

if [[ ! -d "${TASK_DIR}" ]]; then
  echo "[flow-feature-upgrade-docs] Task directory not found: ${TASK_DIR}" >&2
  exit 1
fi

TASK_JSON="${TASK_DIR}/task.json"
FEATURE_KEY=""
if [[ -f "${TASK_JSON}" ]]; then
  FEATURE_KEY="$(python3 - "${TASK_JSON}" <<'PY'
import json,sys
p=sys.argv[1]
try:
    data=json.load(open(p,'r',encoding='utf-8'))
except Exception:
    data={}
for key in ('id','name'):
    value=str(data.get(key,'')).strip()
    if value:
        print(value)
        break
PY
)"
fi
if [[ -z "${FEATURE_KEY}" ]]; then
  FEATURE_KEY="flow-feature"
fi
FEATURE_DIR=".specify/features/${FEATURE_KEY}"
mkdir -p "${FEATURE_DIR}"

append_if_missing() {
  local target="$1"
  local heading="$2"
  local body="$3"
  touch "${target}"
  if rg -n "^${heading//\//\\/}$" "${target}" >/dev/null 2>&1; then
    return 0
  fi
  {
    printf "\n%s\n\n" "${heading}"
    printf "%s\n" "${body}"
  } >> "${target}"
}

for path in "${TASK_DIR}/spec.md" "${FEATURE_DIR}/spec.md"; do
  append_if_missing "${path}" "## Edge Cases" "- What happens when [boundary condition]?\n- How does system handle [error scenario]?"
  append_if_missing "${path}" "## Success Criteria" "- SC-001: success path verified\n- SC-002: failure path verified\n- SC-003: boundary case verified"
done

for path in "${TASK_DIR}/plan.md" "${FEATURE_DIR}/plan.md"; do
  append_if_missing "${path}" "## Technical Context" "- Language/Version: NEEDS CLARIFICATION\n- Dependencies: NEEDS CLARIFICATION\n- Storage: NEEDS CLARIFICATION"
  append_if_missing "${path}" "## Constitution Check" "- Contracts explicit\n- Type safety explicit\n- Verification plan explicit"
done

for path in "${TASK_DIR}/tasks.md" "${FEATURE_DIR}/tasks.md"; do
  append_if_missing "${path}" "## Verify" "- [ ] Verify success case\n- [ ] Verify failure case\n- [ ] Verify boundary case"
done

if [[ ! -s "${FEATURE_DIR}/clarify.md" ]]; then
  cat > "${FEATURE_DIR}/clarify.md" <<'TXT'
# Clarify

## Clarification Summary

- Scope clarified with user.
- Constraints and acceptance criteria confirmed.
TXT
fi

echo "[flow-feature-upgrade-docs] Upgrade patch applied"
echo "  task: ${TASK_DIR}"
echo "  feature: ${FEATURE_DIR}"
