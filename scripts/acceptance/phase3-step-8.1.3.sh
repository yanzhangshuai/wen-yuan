#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3060}"
BOOK_ID="${1:-${BOOK_ID:-}}"

if [[ -z "${BOOK_ID}" ]]; then
  echo "[FAIL] missing BOOK_ID"
  echo "Usage: BOOK_ID=<uuid> $0"
  echo "   or: $0 <book-id>"
  exit 2
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

BASE_JSON="${TMP_DIR}/graph-base.json"
CH1_JSON="${TMP_DIR}/graph-ch1.json"
CH0_JSON="${TMP_DIR}/graph-ch0.json"
BASE_STATUS="${TMP_DIR}/graph-base.status"
CH1_STATUS="${TMP_DIR}/graph-ch1.status"
CH0_STATUS="${TMP_DIR}/graph-ch0.status"

fetch() {
  local url="$1"
  local out="$2"
  local status_file="$3"
  local status

  status="$(curl -sS -o "$out" -w "%{http_code}" "$url")" || {
    echo "[FAIL] request failed: $url"
    exit 1
  }
  echo "$status" > "$status_file"
}

fetch "${BASE_URL}/api/books/${BOOK_ID}/graph" "$BASE_JSON" "$BASE_STATUS"
fetch "${BASE_URL}/api/books/${BOOK_ID}/graph?chapter=1" "$CH1_JSON" "$CH1_STATUS"
fetch "${BASE_URL}/api/books/${BOOK_ID}/graph?chapter=0" "$CH0_JSON" "$CH0_STATUS"

node - "$BASE_JSON" "$CH1_JSON" "$CH0_JSON" "$BASE_STATUS" "$CH1_STATUS" "$CH0_STATUS" <<'NODE'
const fs = require("fs");

const [baseFile, ch1File, ch0File, baseStatusFile, ch1StatusFile, ch0StatusFile] = process.argv.slice(2);

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`[FAIL] invalid json: ${path}`);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
}

const base = readJson(baseFile);
const ch1 = readJson(ch1File);
const ch0 = readJson(ch0File);
const baseHttp = fs.readFileSync(baseStatusFile, "utf8").trim();
const ch1Http = fs.readFileSync(ch1StatusFile, "utf8").trim();
const ch0Http = fs.readFileSync(ch0StatusFile, "utf8").trim();

const baseNodes = Array.isArray(base?.data?.nodes) ? base.data.nodes : null;
const baseEdges = Array.isArray(base?.data?.edges) ? base.data.edges : null;
const ch1Nodes = Array.isArray(ch1?.data?.nodes) ? ch1.data.nodes : null;
const ch1Edges = Array.isArray(ch1?.data?.edges) ? ch1.data.edges : null;

assert(baseHttp === "200", `base graph http must be 200, got ${baseHttp}`);
assert(base?.success === true, "base graph success must be true");
assert(base?.code === "BOOK_GRAPH_FETCHED", "base graph code must be BOOK_GRAPH_FETCHED");
assert(baseNodes !== null, "base graph data.nodes must be array");
assert(baseEdges !== null, "base graph data.edges must be array");

if (baseEdges.length > 0) {
  const sentiment = baseEdges[0]?.sentiment;
  const allowed = new Set(["positive", "negative", "neutral"]);
  assert(allowed.has(sentiment), `sample sentiment invalid: ${String(sentiment)}`);
}

assert(ch1Http === "200", `chapter=1 http must be 200, got ${ch1Http}`);
assert(ch1?.success === true, "chapter=1 success must be true");
assert(ch1?.code === "BOOK_GRAPH_FETCHED", "chapter=1 code must be BOOK_GRAPH_FETCHED");
assert(ch1Nodes !== null, "chapter=1 data.nodes must be array");
assert(ch1Edges !== null, "chapter=1 data.edges must be array");

assert(ch0Http === "400", `chapter=0 http must be 400, got ${ch0Http}`);
assert(ch0?.success === false, "chapter=0 success must be false");
assert(ch0?.code === "COMMON_BAD_REQUEST", "chapter=0 code must be COMMON_BAD_REQUEST");

const summary = {
  result: "PASS",
  checks: {
    base: {
      success: base.success,
      code: base.code,
      nodeCount: baseNodes.length,
      edgeCount: baseEdges.length,
      sampleSentiment: baseEdges[0]?.sentiment ?? null,
    },
    chapter1: {
      success: ch1.success,
      code: ch1.code,
      nodeCount: ch1Nodes.length,
      edgeCount: ch1Edges.length,
    },
    chapter0: {
      success: ch0.success,
      code: ch0.code,
      detail: ch0?.error?.detail ?? null,
    },
  },
};

console.log(JSON.stringify(summary, null, 2));
NODE
