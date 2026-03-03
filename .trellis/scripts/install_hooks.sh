#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${ROOT_DIR}" ]]; then
  echo "[trellis-install-hooks] Not inside a git repository." >&2
  exit 1
fi

cd "${ROOT_DIR}"
mkdir -p .githooks
chmod +x .githooks/* 2>/dev/null || true

git config core.hooksPath .githooks

echo "[trellis-install-hooks] Installed hooksPath=.githooks"
