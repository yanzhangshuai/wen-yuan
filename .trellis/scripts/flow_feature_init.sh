#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT_DIR}" ]]; then
  echo "[flow-feature-init] Not inside a git repository." >&2
  exit 1
fi
cd "${ROOT_DIR}"

usage() {
  cat <<'TXT' >&2
Usage:
  bash .trellis/scripts/flow_feature_init.sh --strategy <fast|strict> "<requirement>" [task-dir] --stack "<tech-stack>"
  bash .trellis/scripts/flow_feature_init.sh --strategy <fast|strict> "<requirement>[ || <tech-stack>]" [task-dir]
  bash .trellis/scripts/flow_feature_init.sh --strategy <fast|strict> "<requirement>" [task-dir] --req-doc <path> --stack-doc <path>

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
  echo "[flow-feature-init] --strategy must be 'fast' or 'strict'." >&2
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
  echo "[flow-feature-init] Unknown argument(s): $*" >&2
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

def b64(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")

print(b64(req.strip()))
print(b64(stack.strip()))
PY
)

REQ="$(printf '%s' "${PARSED_INPUT[0]:-}" | base64 --decode)"
TECH_STACK_INLINE="$(printf '%s' "${PARSED_INPUT[1]:-}" | base64 --decode)"

if [[ -z "${REQ}" ]]; then
  echo "[flow-feature-init] Requirement text is empty after parsing." >&2
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
    echo "[flow-feature-init] ${name} not found: ${raw_path}" >&2
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
snippet = "\n".join(lines[:80]).strip()
if len(lines) > 80:
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
  REQ_DOC_BLOCK="
### Requirement Document Excerpt

\`\`\`text
$(doc_excerpt "${REQ_DOC_ABS}")
\`\`\`
"
fi

STACK_DOC_NOTE="Not provided"
STACK_DOC_BLOCK=""
if [[ -n "${STACK_DOC_ABS}" ]]; then
  STACK_DOC_NOTE="\`${STACK_DOC_PATH}\`"
  STACK_DOC_BLOCK="
### Tech Stack Document Excerpt

\`\`\`text
$(doc_excerpt "${STACK_DOC_ABS}")
\`\`\`
"
fi

TECH_STACK_HINT="NEEDS CLARIFICATION"
if [[ -n "${TECH_STACK_INLINE}" ]]; then
  TECH_STACK_HINT="${TECH_STACK_INLINE}"
elif [[ -n "${STACK_DOC_PATH}" ]]; then
  TECH_STACK_HINT="Refer to ${STACK_DOC_PATH}"
fi
SHOULD_REFRESH_PLAN=0
if [[ -n "${TECH_STACK_INLINE}" || -n "${REQ_DOC_PATH}" || -n "${STACK_DOC_PATH}" ]]; then
  SHOULD_REFRESH_PLAN=1
fi

if [[ -n "${TASK_DIR_INPUT}" ]]; then
  TASK_DIR="${TASK_DIR_INPUT}"
else
  if [[ ! -f .trellis/.current-task ]]; then
    echo "[flow-feature-init] Missing .trellis/.current-task, please pass task-dir." >&2
    exit 1
  fi
  TASK_DIR="$(cat .trellis/.current-task)"
fi

if [[ ! -d "${TASK_DIR}" ]]; then
  echo "[flow-feature-init] Task directory not found: ${TASK_DIR}" >&2
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

path.write_text(
    json.dumps(data, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
PY
fi

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
  FEATURE_KEY="${BRANCH#???-}"
  if [[ -z "${FEATURE_KEY}" || "${FEATURE_KEY}" == "${BRANCH}" ]]; then
    FEATURE_KEY="flow-feature"
  fi
fi

FEATURE_DIR=".specify/features/${FEATURE_KEY}"
mkdir -p "${FEATURE_DIR}"

write_if_missing() {
  local target="$1"
  local content="$2"
  if [[ -s "${target}" ]]; then
    return 0
  fi
  printf "%s\n" "${content}" > "${target}"
}

refresh_plan_values() {
  local target="$1"
  python3 - "${target}" "${REQ}" "${REQ_DOC_NOTE}" "${TECH_STACK_INLINE}" "${STACK_DOC_NOTE}" "${TECH_STACK_HINT}" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
if not path.exists():
    raise SystemExit(0)

text = path.read_text(encoding="utf-8", errors="replace")
if not text.strip():
    raise SystemExit(0)

replacements = {
    "- Requirement input:": f"- Requirement input: {sys.argv[2]}",
    "- Requirement doc:": f"- Requirement doc: {sys.argv[3]}",
    "- Inline tech stack input:": f"- Inline tech stack input: {sys.argv[4] or 'Not provided'}",
    "- Tech stack doc:": f"- Tech stack doc: {sys.argv[5]}",
    "- Stack baseline:": f"- Stack baseline: {sys.argv[6]}",
}

lines = text.splitlines()
for i, line in enumerate(lines):
    for prefix, value in replacements.items():
        if re.match(rf"^\s*{re.escape(prefix)}", line):
            lines[i] = value
            break

updated = "\n".join(lines)
if text.endswith("\n"):
    updated += "\n"
path.write_text(updated, encoding="utf-8")
PY
}

if [[ "${STRATEGY}" == "fast" ]]; then
  SPEC_CONTENT="# Feature Specification: ${REQ}

**Feature Branch**: \`${BRANCH}\`  
**Created**: ${TODAY}  
**Status**: Draft  
**Input**: User description: \"${REQ}\"

## User Scenarios & Testing

### User Story 1 - Core Delivery (Priority: P1)

- Goal: ${REQ}
- Independent Test: execute the primary flow and confirm expected result.

## Requirements

### Functional Requirements

- FR-001: System MUST implement: ${REQ}
- FR-002: System MUST expose a clear success path.
- FR-003: System MUST provide a clear failure path with stable error code/message.
- FR-004: System MUST define at least one boundary case.

## Required Team Constraints (Spec-Kit)

- Frontend reuse/readability/performance constraints must be respected.
- Props typing must be explicit as \`<ComponentName>Props\` when adding components.
- Naming must stay consistent across UI/action/API/service/DB layers.
- Non-trivial logic must include detailed comments for intent, I/O, edge cases, and side effects.

## Success Criteria

- SC-001: success/failure/boundary cases are explicitly verified.
- SC-002: implementation can be reproduced with documented commands.
"

  CLARIFY_CONTENT="# Clarify

- Requirement confirmed: ${REQ}
- Scope: implement only what is required for this flow-feature.
- Out of scope: unrelated refactors.
"

  PLAN_CONTENT="# Implementation Plan: ${REQ}

**Branch**: \`${BRANCH}\` | **Date**: ${TODAY}

## Summary

- Implement the minimum complete change for: ${REQ}
- Keep cross-layer contracts stable and explicit.

## Input Artifacts

- Requirement input: ${REQ}
- Requirement doc: ${REQ_DOC_NOTE}
- Inline tech stack input: ${TECH_STACK_INLINE:-Not provided}
- Tech stack doc: ${STACK_DOC_NOTE}

## Technical Context

- Stack baseline: ${TECH_STACK_HINT}
- Dependencies: NEEDS CLARIFICATION
- Storage: NEEDS CLARIFICATION
- Testing: success + failure + boundary verification

## Required Team Constraints (Spec-Kit)

- Frontend reuse/readability/performance
- Props typing
- Naming consistency
- Detailed comments for non-trivial logic
${REQ_DOC_BLOCK}${STACK_DOC_BLOCK}
"

  TASKS_CONTENT="# Tasks: ${REQ}

- [ ] T001 Confirm scope and constraints
- [ ] T002 Implement core success path
- [ ] T003 Implement failure-path handling and stable errors
- [ ] T004 Verify at least one boundary case
- [ ] T005 Run quality checks and record verification
"
else
  SPEC_CONTENT="# Feature Specification: ${REQ}

**Feature Branch**: \`${BRANCH}\`  
**Created**: ${TODAY}  
**Status**: Draft  
**Input**: User description: \"${REQ}\"

## User Scenarios & Testing

### User Story 1 - Core Delivery (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and reason]

**Independent Test**: [How to verify this story independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

## Edge Cases

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements

### Functional Requirements

- FR-001: System MUST [capability]
- FR-002: System MUST [capability]
- FR-003: Users MUST be able to [interaction]

### Key Entities

- Entity 1: [description]
- Entity 2: [description]

## Required Team Constraints (Spec-Kit)

- Frontend reuse/readability/performance
- Props typing (<ComponentName>Props)
- Naming consistency
- Detailed comments for non-trivial logic

## Success Criteria

- SC-001: success path is measurable and verified
- SC-002: failure path is measurable and verified
- SC-003: boundary case is measurable and verified
"

  CLARIFY_CONTENT="# Clarify

## Clarification Summary

- Requirement: ${REQ}
- Scope and acceptance criteria clarified with user

## Open Questions

- [If none, write: None]
"

  PLAN_CONTENT="# Implementation Plan: ${REQ}

**Branch**: \`${BRANCH}\` | **Date**: ${TODAY}

## Summary

[Primary requirement + technical approach]

## Input Artifacts

- Requirement input: ${REQ}
- Requirement doc: ${REQ_DOC_NOTE}
- Inline tech stack input: ${TECH_STACK_INLINE:-Not provided}
- Tech stack doc: ${STACK_DOC_NOTE}

## Technical Context

- Stack baseline: ${TECH_STACK_HINT}
- Primary Dependencies: NEEDS CLARIFICATION
- Storage: NEEDS CLARIFICATION
- Testing: success + failure + boundary
- Constraints: risk, rollback, compatibility

## Constitution Check

- Contracts and error codes are explicit
- Type safety boundaries are explicit
- Quality checks are planned

## Project Structure

- docs: specs/<feature>/
- code: [target directories]

## Required Team Constraints (Spec-Kit)

- Frontend reuse/readability/performance
- Props typing
- Naming consistency
- Detailed comments for non-trivial logic
${REQ_DOC_BLOCK}${STACK_DOC_BLOCK}
"

  TASKS_CONTENT="# Tasks: ${REQ}

## Phase 1: Setup

- [ ] T001 Confirm scope and constraints
- [ ] T002 Confirm dependencies and environment

## Phase 2: Foundation

- [ ] T003 Implement required foundational changes
- [ ] T004 Add error handling and contract checks

## Phase 3: Implementation

- [ ] T005 Implement success path
- [ ] T006 Implement failure path
- [ ] T007 Implement boundary handling

## Phase 4: Verify

- [ ] T008 Verify success case
- [ ] T009 Verify failure case
- [ ] T010 Verify boundary case

## Phase 5: Handoff

- [ ] T011 Update docs and run quality checks
"
fi

write_if_missing "${TASK_DIR}/spec.md" "${SPEC_CONTENT}"
write_if_missing "${TASK_DIR}/plan.md" "${PLAN_CONTENT}"
write_if_missing "${TASK_DIR}/tasks.md" "${TASKS_CONTENT}"
write_if_missing "${TASK_DIR}/check.md" "# Check\n\n- [ ] success path verified\n- [ ] failure path verified\n- [ ] boundary case verified"

write_if_missing "${FEATURE_DIR}/spec.md" "${SPEC_CONTENT}"
write_if_missing "${FEATURE_DIR}/clarify.md" "${CLARIFY_CONTENT}"
write_if_missing "${FEATURE_DIR}/plan.md" "${PLAN_CONTENT}"
write_if_missing "${FEATURE_DIR}/tasks.md" "${TASKS_CONTENT}"

if [[ "${SHOULD_REFRESH_PLAN}" -eq 1 ]]; then
  refresh_plan_values "${TASK_DIR}/plan.md"
  refresh_plan_values "${FEATURE_DIR}/plan.md"
fi

LABEL="fast"
if [[ "${STRATEGY}" == "strict" ]]; then
  LABEL="full"
fi

echo "[flow-feature-${LABEL}-init] Prepared ${LABEL} docs"
echo "  task: ${TASK_DIR}"
echo "  feature: ${FEATURE_DIR}"
