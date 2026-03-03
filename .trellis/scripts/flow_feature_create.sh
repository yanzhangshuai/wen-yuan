#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT_DIR}" ]]; then
  echo "[flow-feature-create] Not inside a git repository." >&2
  exit 1
fi
cd "${ROOT_DIR}"

REQ="${1:-}"
SHORT="${2:-}"
if [[ -z "${REQ}" ]]; then
  echo "Usage: bash .trellis/scripts/flow_feature_create.sh \"<requirement>\" [short-name]" >&2
  exit 1
fi

normalize_short_name() {
  local raw="${1:-}"
  python3 - "${raw}" <<'PY'
import re,sys
raw = (sys.argv[1] or "").strip().lower()
slug = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
slug = re.sub(r"-{2,}", "-", slug)
print(slug)
PY
}

generate_auto_short_name() {
  local req="${1:-}"
  python3 - "${req}" <<'PY'
import hashlib,re,sys

req = (sys.argv[1] or "").strip()
stop_words = {
    "a","an","the","to","for","of","in","on","at","by","with","from",
    "is","are","was","were","be","been","being","have","has","had",
    "do","does","did","will","would","should","could","can","may","might",
    "must","shall","this","that","these","those","my","your","our","their",
    "want","need","add","get","set","and","or"
}

tokens = []
for token in re.findall(r"[A-Za-z0-9]+", req.lower()):
    if token in stop_words:
        continue
    if len(token) < 2:
        continue
    tokens.append(token)

dedup_tokens = []
seen = set()
for token in tokens:
    if token and token not in seen:
        seen.add(token)
        dedup_tokens.append(token)

if not dedup_tokens:
    dedup_tokens = ["feature"]

base = "-".join(dedup_tokens[:4])
base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
base = re.sub(r"-{2,}", "-", base)
if not base:
    base = "feature"

digest = hashlib.sha1(req.encode("utf-8")).hexdigest()[:6]
print(f"{base}-{digest}")
PY
}

run_create() {
  local req="$1"
  local short="$2"
  if [[ -n "${short}" ]]; then
    .specify/scripts/bash/create-new-feature.sh --json --short-name "${short}" "${req}"
  else
    .specify/scripts/bash/create-new-feature.sh --json "${req}"
  fi
}

extract_branch() {
  local raw="${1:-}"
  python3 - "${raw}" <<'PY'
import json,sys
text=sys.argv[1].strip().splitlines()
branch=""
for line in reversed(text):
    line=line.strip()
    if line.startswith('{') and line.endswith('}'):
        try:
            obj=json.loads(line)
            branch=obj.get('BRANCH_NAME','')
            break
        except Exception:
            pass
print(branch)
PY
}

is_valid_branch() {
  local b="$1"
  [[ "$b" =~ ^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$ ]]
}

if [[ -n "${SHORT}" ]]; then
  SHORT="$(normalize_short_name "${SHORT}")"
  if [[ -z "${SHORT}" ]]; then
    echo "[flow-feature-create] Provided short-name is invalid after normalization." >&2
    echo "Please retry with kebab-case 2-4 words (letters/numbers)." >&2
    exit 1
  fi
else
  SHORT="$(generate_auto_short_name "${REQ}")"
  echo "[flow-feature-create] Auto-generated short-name: ${SHORT}" >&2
fi

OUT="$(run_create "${REQ}" "${SHORT}")"
echo "${OUT}"
BRANCH="$(extract_branch "${OUT}")"

if is_valid_branch "${BRANCH}"; then
  exit 0
fi

echo "[flow-feature-create] Detected invalid short branch name: ${BRANCH}" >&2
echo "[flow-feature-create] Provided short-name is invalid. Please retry with kebab-case 2-4 words." >&2
exit 1
