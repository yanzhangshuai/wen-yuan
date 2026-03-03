#!/usr/bin/env bash
set -euo pipefail

MAX_FILES=3
MAX_LINES=120

usage() {
  echo "Usage: bash .trellis/scripts/context_budget_read.sh [--max-files N] [--max-lines N] <file1> [file2 ...]" >&2
}

ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-files)
      MAX_FILES="$2"
      shift 2
      ;;
    --max-lines)
      MAX_LINES="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ ${#ARGS[@]} -eq 0 ]]; then
  usage
  exit 1
fi

count=0
for path in "${ARGS[@]}"; do
  if [[ $count -ge $MAX_FILES ]]; then
    echo "[context-budget] file limit reached (${MAX_FILES}), remaining files skipped." >&2
    break
  fi
  if [[ ! -f "$path" ]]; then
    echo "[context-budget] skip missing file: $path" >&2
    continue
  fi
  count=$((count + 1))
  echo "===== ${path} (first ${MAX_LINES} lines) ====="
  sed -n "1,${MAX_LINES}p" "$path"
  total_lines=$(wc -l < "$path" | tr -d ' ')
  if [[ "$total_lines" -gt "$MAX_LINES" ]]; then
    echo "... (${total_lines} total lines, truncated)"
  fi
  echo
 done
