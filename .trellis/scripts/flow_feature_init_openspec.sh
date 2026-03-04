#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT_DIR}" ]]; then
  echo "[flow-feature-openspec-init] Not inside a git repository." >&2
  exit 1
fi
cd "${ROOT_DIR}"

usage() {
  cat <<'TXT' >&2
Usage:
  bash .trellis/scripts/flow_feature_init_openspec.sh --strategy <fast|strict> "<requirement>" [task-dir]
  bash .trellis/scripts/flow_feature_init_openspec.sh --strategy <fast|strict> --task-dir <dir> "<requirement>"
  bash .trellis/scripts/flow_feature_init_openspec.sh --strategy <fast|strict> "<requirement>" [task-dir] --stack "<tech-stack>"
  bash .trellis/scripts/flow_feature_init_openspec.sh --strategy <fast|strict> "<requirement>" [task-dir] --req-doc <path> --stack-doc <path>

Options:
  --strategy <fast|strict>          required strategy selector
  --task-dir <dir>                  explicit task directory (fallback: .trellis/.current-task)
  --stack | --tech-stack <text>     inline tech stack description
  --req-doc | --requirement-doc     requirement document path
  --stack-doc | --tech-stack-doc    tech stack document path
TXT
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

STRATEGY=""
TASK_DIR_INPUT=""
REQ_DOC_PATH=""
STACK_DOC_PATH=""
STACK_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strategy)
      STRATEGY="${2:-}"
      shift 2
      ;;
    --task-dir)
      TASK_DIR_INPUT="${2:-}"
      shift 2
      ;;
    --stack|--tech-stack)
      STACK_OVERRIDE="${2:-}"
      shift 2
      ;;
    --req-doc|--requirement-doc)
      REQ_DOC_PATH="${2:-}"
      shift 2
      ;;
    --stack-doc|--tech-stack-doc)
      STACK_DOC_PATH="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

if [[ "${STRATEGY}" != "fast" && "${STRATEGY}" != "strict" ]]; then
  echo "[flow-feature-openspec-init] --strategy must be 'fast' or 'strict'." >&2
  usage
  exit 1
fi

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

INPUT_RAW="${1:-}"
shift || true

if [[ -z "${INPUT_RAW}" ]]; then
  usage
  exit 1
fi

if [[ $# -gt 0 ]]; then
  if [[ -z "${TASK_DIR_INPUT}" ]]; then
    TASK_DIR_INPUT="$1"
    shift
  fi
fi

if [[ $# -gt 0 ]]; then
  echo "[flow-feature-openspec-init] Unknown argument(s): $*" >&2
  usage
  exit 1
fi

readarray -t PARSED_INPUT < <(python3 - "${INPUT_RAW}" "${STACK_OVERRIDE}" <<'PY'
import base64
import re
import sys

raw = (sys.argv[1] or "").strip()
stack_override = (sys.argv[2] or "").strip()
req = raw
stack = ""

if "||" in raw:
    req, stack = raw.split("||", 1)
else:
    req_lines = []
    in_stack = False
    for line in raw.splitlines():
        m = re.match(r"^\s*(技术栈|tech\s*stack|stack)\s*[:：]\s*(.*)$", line, flags=re.I)
        if m:
            in_stack = True
            stack = m.group(2).strip()
            continue
        if in_stack:
            if line.strip():
                stack = (stack + "\n" + line.strip()).strip()
                continue
            in_stack = False
        req_lines.append(line)
    if req_lines:
        req = "\n".join(req_lines).strip()

if stack_override:
    stack = stack_override

print(base64.b64encode(req.strip().encode("utf-8")).decode("ascii"))
print(base64.b64encode(stack.strip().encode("utf-8")).decode("ascii"))
PY
)

REQ="$(printf '%s' "${PARSED_INPUT[0]:-}" | base64 --decode)"
TECH_STACK_INLINE="$(printf '%s' "${PARSED_INPUT[1]:-}" | base64 --decode)"

if [[ -z "${REQ}" ]]; then
  echo "[flow-feature-openspec-init] Requirement text is empty after parsing." >&2
  exit 1
fi

resolve_doc_path() {
  local raw_path="$1"
  local name="$2"
  if [[ -z "${raw_path}" ]]; then
    echo ""
    return 0
  fi
  local abs_path
  abs_path="$(python3 - "${ROOT_DIR}" "${raw_path}" <<'PY'
import os,sys
root=sys.argv[1]
raw=sys.argv[2]
print(os.path.realpath(raw if os.path.isabs(raw) else os.path.join(root, raw)))
PY
)"
  if [[ ! -f "${abs_path}" ]]; then
    echo "[flow-feature-openspec-init] ${name} not found: ${raw_path}" >&2
    exit 1
  fi
  echo "${abs_path}"
}

doc_excerpt() {
  local abs_path="$1"
  python3 - "${abs_path}" <<'PY'
import pathlib,sys
p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding="utf-8", errors="replace")
lines = text.splitlines()
snippet = "\n".join(lines[:60]).strip()
if len(lines) > 60:
    snippet += "\n... (truncated)"
print(snippet)
PY
}

REQ_DOC_ABS="$(resolve_doc_path "${REQ_DOC_PATH}" "requirement doc")"
STACK_DOC_ABS="$(resolve_doc_path "${STACK_DOC_PATH}" "tech stack doc")"

REQ_DOC_NOTE="Not provided"
REQ_DOC_BLOCK=""
if [[ -n "${REQ_DOC_ABS}" ]]; then
  REQ_DOC_NOTE="\`${REQ_DOC_PATH}\`"
  REQ_DOC_BLOCK="\n### Requirement Document Excerpt\n\n\`\`\`text\n$(doc_excerpt "${REQ_DOC_ABS}")\n\`\`\`\n"
fi

STACK_DOC_NOTE="Not provided"
STACK_DOC_BLOCK=""
if [[ -n "${STACK_DOC_ABS}" ]]; then
  STACK_DOC_NOTE="\`${STACK_DOC_PATH}\`"
  STACK_DOC_BLOCK="\n### Tech Stack Document Excerpt\n\n\`\`\`text\n$(doc_excerpt "${STACK_DOC_ABS}")\n\`\`\`\n"
fi

TECH_STACK_HINT="NEEDS CLARIFICATION"
if [[ -n "${TECH_STACK_INLINE}" ]]; then
  TECH_STACK_HINT="${TECH_STACK_INLINE}"
elif [[ -n "${STACK_DOC_PATH}" ]]; then
  TECH_STACK_HINT="Refer to ${STACK_DOC_PATH}"
fi

if [[ -n "${TASK_DIR_INPUT}" ]]; then
  TASK_DIR="${TASK_DIR_INPUT}"
else
  if [[ ! -f .trellis/.current-task ]]; then
    echo "[flow-feature-openspec-init] Missing .trellis/.current-task, please pass task-dir." >&2
    exit 1
  fi
  TASK_DIR="$(cat .trellis/.current-task)"
fi

if [[ ! -d "${TASK_DIR}" ]]; then
  echo "[flow-feature-openspec-init] Task directory not found: ${TASK_DIR}" >&2
  exit 1
fi

BRANCH="$(git branch --show-current || true)"
if [[ -z "${BRANCH}" ]]; then
  BRANCH="000-feature"
fi
TODAY="$(date +%F)"

TASK_JSON="${TASK_DIR}/task.json"
if [[ -f "${TASK_JSON}" ]]; then
  python3 - "${TASK_JSON}" "${STRATEGY}" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
strategy = sys.argv[2]
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    data = {}

data["workflow"] = "flow-feature"
data["workflow_type"] = "flow-feature"
data["workflow_strategy"] = "speed" if strategy == "fast" else "strict"
data["workflow_framework"] = "openspec"

path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY
fi

CHANGE_KEY="$(python3 - "${TASK_JSON}" "${TASK_DIR}" <<'PY'
import json
import pathlib
import re
import sys

def slug(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"^[0-9]{2}-[0-9]{2}-", "", text)
    text = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "flow-feature"

task_json = pathlib.Path(sys.argv[1])
task_dir = pathlib.Path(sys.argv[2])
if task_json.exists():
    try:
        data = json.loads(task_json.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    for key in ("id", "name", "title"):
        value = str(data.get(key, "")).strip()
        if value:
            print(slug(value))
            raise SystemExit(0)
print(slug(task_dir.name))
PY
)"

CHANGE_DIR="openspec/changes/${CHANGE_KEY}"
mkdir -p "${CHANGE_DIR}"

write_if_missing() {
  local target="$1"
  local content="$2"
  if [[ -s "${target}" ]]; then
    return 0
  fi
  printf "%s\n" "${content}" > "${target}"
}

TASK_SPEC_CONTENT="# Feature Spec (OpenSpec-backed): ${REQ}

**Branch**: \`${BRANCH}\`  
**Date**: ${TODAY}  
**Framework**: OpenSpec + Trellis

## Summary
- Requirement: ${REQ}
- Strategy: ${STRATEGY}
- Change: ${CHANGE_KEY}

## OpenSpec Artifacts
- proposal: \`${CHANGE_DIR}/proposal.md\`
- design: \`${CHANGE_DIR}/design.md\`
- tasks: \`${CHANGE_DIR}/tasks.md\`
- spec-delta: \`${CHANGE_DIR}/spec-delta.md\`
"

TASK_PLAN_CONTENT="# Implementation Plan (OpenSpec-backed): ${REQ}

## Inputs
- Requirement input: ${REQ}
- Requirement doc: ${REQ_DOC_NOTE}
- Inline tech stack input: ${TECH_STACK_INLINE:-Not provided}
- Tech stack doc: ${STACK_DOC_NOTE}
- Stack baseline: ${TECH_STACK_HINT}

## Execution
1. Complete OpenSpec proposal/design/tasks/spec-delta.
2. Run flow-confirm and wait explicit approval.
3. Implement and verify success/failure/boundary.
4. Run flow-guard --verify.
${REQ_DOC_BLOCK}${STACK_DOC_BLOCK}
"

if [[ "${STRATEGY}" == "strict" ]]; then
  TASK_TASKS_CONTENT="# Tasks (OpenSpec strict): ${REQ}

- [ ] T001 Confirm scope and constraints
- [ ] T002 Complete proposal.md
- [ ] T003 Complete design.md
- [ ] T004 Complete spec-delta.md
- [ ] T005 Complete tasks.md with ordered checklist
- [ ] T006 Implement success path
- [ ] T007 Implement failure path
- [ ] T008 Implement boundary handling
- [ ] T009 Verify success case
- [ ] T010 Verify failure case
- [ ] T011 Verify boundary case
- [ ] T012 Update docs and run quality checks
"
else
  TASK_TASKS_CONTENT="# Tasks (OpenSpec fast): ${REQ}

- [ ] T001 Confirm scope and constraints
- [ ] T002 Fill minimum OpenSpec docs (proposal/design/tasks/spec-delta)
- [ ] T003 Implement success path
- [ ] T004 Implement failure path
- [ ] T005 Implement boundary handling
- [ ] T006 Verify success/failure/boundary and quality checks
"
fi

OPENSPEC_PROPOSAL="# Proposal: ${CHANGE_KEY}

## Why
- ${REQ}

## Scope
- In scope: deliver required behavior for this change.
- Out of scope: unrelated refactors.

## Success Criteria
- [ ] Success path is testable
- [ ] Failure path is testable
- [ ] Boundary path is testable
"

OPENSPEC_DESIGN="# Design: ${CHANGE_KEY}

## Architecture
- Technical baseline: ${TECH_STACK_HINT}
- Affected modules: [to be completed]

## Contracts
- API changes: [to be completed]
- DB changes: [to be completed]
- Async/queue changes: [to be completed]

## Trade-offs
- Option A: [to be completed]
- Option B: [to be completed]
- Final choice: [to be completed]
"

OPENSPEC_TASKS="# Tasks: ${CHANGE_KEY}

- [ ] T001 Confirm scope and constraints
- [ ] T002 Implement success path
- [ ] T003 Implement failure path
- [ ] T004 Implement boundary handling
- [ ] T005 Verify success case
- [ ] T006 Verify failure case
- [ ] T007 Verify boundary case
"

OPENSPEC_DELTA="# Spec Delta: ${CHANGE_KEY}

## Added
- [to be completed]

## Changed
- [to be completed]

## Removed
- [to be completed]

## Compatibility
- [to be completed]
"

write_if_missing "${TASK_DIR}/spec.md" "${TASK_SPEC_CONTENT}"
write_if_missing "${TASK_DIR}/plan.md" "${TASK_PLAN_CONTENT}"
write_if_missing "${TASK_DIR}/tasks.md" "${TASK_TASKS_CONTENT}"
write_if_missing "${TASK_DIR}/check.md" "# Check\n\n- [ ] success path verified\n- [ ] failure path verified\n- [ ] boundary case verified"

write_if_missing "${CHANGE_DIR}/proposal.md" "${OPENSPEC_PROPOSAL}"
write_if_missing "${CHANGE_DIR}/design.md" "${OPENSPEC_DESIGN}"
write_if_missing "${CHANGE_DIR}/tasks.md" "${OPENSPEC_TASKS}"
write_if_missing "${CHANGE_DIR}/spec-delta.md" "${OPENSPEC_DELTA}"

echo "[flow-feature-openspec-init] Prepared ${STRATEGY} docs"
echo "  task: ${TASK_DIR}"
echo "  change: ${CHANGE_DIR}"
