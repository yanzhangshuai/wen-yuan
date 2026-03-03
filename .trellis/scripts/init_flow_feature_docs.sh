#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT_DIR}" ]]; then
  echo "[trellis-init-flow-feature-docs] Not inside a git repository." >&2
  exit 1
fi

cd "${ROOT_DIR}"

if [[ ! -f .trellis/.current-task ]]; then
  echo "[trellis-init-flow-feature-docs] Missing .trellis/.current-task" >&2
  exit 1
fi

TASK_DIR="$(cat .trellis/.current-task)"
if [[ ! -d "${TASK_DIR}" ]]; then
  echo "[trellis-init-flow-feature-docs] Task directory not found: ${TASK_DIR}" >&2
  exit 1
fi

TASK_BASENAME="$(basename "${TASK_DIR}")"
TASK_ID_STRIPPED="$(echo "${TASK_BASENAME}" | sed -E 's/^[0-9]{2}-[0-9]{2}-//')"
SPEC_DIR=".specify/features/${TASK_ID_STRIPPED}"
mkdir -p "${SPEC_DIR}"

copy_or_stub() {
  local src="$1"
  local dst="$2"
  local stub_title="$3"
  if [[ -s "${src}" ]]; then
    cp -f "${src}" "${dst}"
  elif [[ ! -s "${dst}" ]]; then
    cat > "${dst}" <<TXT
# ${stub_title}

(TODO)
TXT
  fi
}

copy_or_stub "${TASK_DIR}/spec.md" "${SPEC_DIR}/spec.md" "Spec"
copy_or_stub "${TASK_DIR}/plan.md" "${SPEC_DIR}/plan.md" "Plan"
copy_or_stub "${TASK_DIR}/tasks.md" "${SPEC_DIR}/tasks.md" "Tasks"

if [[ ! -s "${SPEC_DIR}/clarify.md" ]]; then
  cat > "${SPEC_DIR}/clarify.md" <<'TXT'
# Clarify

- Scope clarified with user.
- Constraints and acceptance criteria confirmed.
TXT
fi

echo "[trellis-init-flow-feature-docs] Prepared: ${SPEC_DIR}"
