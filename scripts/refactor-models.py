#!/usr/bin/env python3
"""Extract connectivity helpers and admin adapters from models/index.ts."""
SRC = "src/server/modules/models/index.ts"

with open(SRC, encoding="utf-8") as f:
    lines = f.readlines()

def extract(s, e):
    return "".join(lines[s - 1 : e])

# ── Connectivity helpers (verified ranges) ────────────────────────────────
conn = [
    (195, 201),   # connectivityHostAllowList
    (217, 233),   # parseExtraConnectivityHosts + doc
    (235, 245),   # isAllowedHost + doc
    (247, 275),   # assertConnectivityBaseUrlAllowed + doc
    (356, 362),   # getErrorMessage
    (364, 366),   # isRecord
    (368, 389),   # classifyHttpErrorType + doc
    (391, 413),   # classifyThrownErrorType + doc
    (415, 428),   # classifySemanticErrorType
    (430, 462),   # hasOpenAiCompatibleMessage
    (464, 498),   # validateOpenAiCompatibleProbePayload
    (500, 503),   # ExtractedResponseDetail interface
    (505, 564),   # extractResponseDetail + doc
]

# ── Admin adapters (verified ranges) ──────────────────────────────────────
admin = [
    (888, 891),   # getDefaultModelsModule
    (893, 895),   # listModels export
    (897, 899),   # updateModel export
    (901, 903),   # setDefaultModel export
    (905, 907),   # testModelConnectivity export
    (909, 927),   # toApiKeyChange
    (929, 935),   # listAdminModels + doc
    (936, 948),   # updateAdminModel
    (949, 951),   # setDefaultAdminModel
    (953, 955),   # testAdminModelConnection
]

# ── Write connectivity.ts ─────────────────────────────────────────────────
out = ['import type { ModelConnectivityErrorType, SupportedProvider } from "./index";\n\n']
for s, e in conn:
    chunk = extract(s, e)
    for prefix in [
        "const connectivityHostAllowList",
        "function parseExtraConnectivityHosts(",
        "function isAllowedHost(",
        "function assertConnectivityBaseUrlAllowed(",
        "function getErrorMessage(",
        "function isRecord(",
        "function classifyHttpErrorType(",
        "function classifyThrownErrorType(",
        "function classifySemanticErrorType(",
        "function hasOpenAiCompatibleMessage(",
        "function validateOpenAiCompatibleProbePayload(",
        "async function extractResponseDetail(",
        "interface ExtractedResponseDetail",
    ]:
        chunk = chunk.replace(prefix, "export " + prefix)
    out.append(chunk + "\n")

conn_text = "".join(out)
with open("src/server/modules/models/connectivity.ts", "w", encoding="utf-8") as f:
    f.write(conn_text)
print(f"Wrote connectivity.ts ({conn_text.count(chr(10))} lines)")

# ── Write admin-adapters.ts ───────────────────────────────────────────────
admin_text = """import type {
  ApiKeyChange,
  ModelConnectivityResult,
  ModelListItem,
  UpdateAdminModelPayload,
  UpdateModelInput
} from "./index";
import { createModelsModule } from "./index";

"""
for s, e in admin:
    admin_text += extract(s, e) + "\n"

with open("src/server/modules/models/admin-adapters.ts", "w", encoding="utf-8") as f:
    f.write(admin_text)
print(f"Wrote admin-adapters.ts ({admin_text.count(chr(10))} lines)")

# ── Rebuild index.ts ──────────────────────────────────────────────────────
removed = set()
for ranges in [conn, admin]:
    for s, e in ranges:
        for i in range(s - 1, e):
            removed.add(i)

new_lines = []
prev_blank = False
for i, line in enumerate(lines):
    if i in removed:
        continue
    blank = line.strip() == ""
    if blank and prev_blank:
        continue
    new_lines.append(line)
    prev_blank = blank

# Insert connectivity import after last import
last_imp = 0
for i, line in enumerate(new_lines):
    if line.startswith("import "):
        last_imp = i

imp = """
import {
  assertConnectivityBaseUrlAllowed,
  classifyHttpErrorType,
  classifySemanticErrorType,
  classifyThrownErrorType,
  extractResponseDetail,
  getErrorMessage,
  validateOpenAiCompatibleProbePayload
} from "./connectivity";
"""
new_lines.insert(last_imp + 1, imp)

# Re-export admin adapters
reexport = """
// ── Admin adapters (re-exported for backward compatibility) ──────────────
export {
  listAdminModels,
  listModels,
  setDefaultAdminModel,
  setDefaultModel,
  testAdminModelConnection,
  testModelConnectivity,
  updateAdminModel,
  updateModel
} from "./admin-adapters";
"""
new_lines.append(reexport)

new_text = "".join(new_lines)
with open(SRC, "w", encoding="utf-8") as f:
    f.write(new_text)
print(f"Rewrote index.ts ({new_text.count(chr(10))} lines, was {len(lines)})")
print("Done.")
#!/usr/bin/env python3
"""Extract connectivity helpers and admin adapters from models/index.ts."""

SRC = "src/server/modules/models/index.ts"

with open(SRC, encoding="utf-8") as f:
    lines = f.readlines()

def extract(s: int, e: int) -> str:
    """Return lines[s-1..e-1] inclusive (1-based)."""
    return "".join(lines[s - 1 : e])

def check(line_1: int, snippet: str):
    actual = lines[line_1 - 1]
    assert snippet in actual, f"L{line_1}: expected {snippet!r}, got {actual.rstrip()!r}"

# ── Verified line ranges ──────────────────────────────────────────────────
# Connectivity helpers
conn = [
    (195, 201),   # connectivityHostAllowList
    (216, 234),   # parseExtraConnectivityHosts + doc
    (235, 248),   # isAllowedHost + doc
    (247, 282),   # assertConnectivityBaseUrlAllowed + doc
    (356, 362),   # getErrorMessage
    (364, 366),   # isRecord
    (368, 396),   # classifyHttpErrorType + doc
    (391, 413),   # classifyThrownErrorType + doc
    (415, 428),   # classifySemanticErrorType
    (430, 462),   # hasOpenAiCompatibleMessage
    (464, 498),   # validateOpenAiCompatibleProbePayload
    (500, 503),   # ExtractedResponseDetail interface
    (505, 564),   # extractResponseDetail + doc
]

# Admin adapters
admin = [
    (888, 891),   # getDefaultModelsModule
    (893, 895),   # listModels export
    (897, 899),   # updateModel export
    (901, 903),   # setDefaultModel export
    (905, 907),   # testModelConnectivity export
    (909, 930),   # toApiKeyChange
    (929, 935),   # listAdminModels + doc comment
    (936, 948),   # updateAdminModel
    (949, 951),   # setDefaultAdminModel
    (953, 955),   # testAdminModelConnection
]

# Spot-checks
check(195, "connectivityHostAllowList")
check(201, "}")
check(224, "function parseExtraConnectivityHosts(")
check(234, "}")
check(242, "function isAllowedHost(")
check(248, "}")
check(254, "function assertConnectivityBaseUrlAllowed(")
check(282, "}")
check(356, "function getErrorMessage(")
check(362, "}")
check(364, "function isRecord(")
check(366, "}")
check(375, "function classifyHttpErrorType(")
check(396, "}")
check(398, "function classifyThrownErrorType(")
check(413, "}")
check(415, "function classifySemanticErrorType(")
check(428, "}")
check(430, "function hasOpenAiCompatibleMessage(")
check(462, "}")
check(464, "function validateOpenAiCompatibleProbePayload(")
check(498, "}")
check(500, "interface ExtractedResponseDetail")
check(503, "}")
check(512, "async function extractResponseDetail(")
check(564, "}")
check(888, "async function getDefaultModelsModule()")
check(891, "}")
check(909, "function toApiKeyChange(")
check(930, "}")
check(932, "export async function listAdminModels()")
check(955, "}")
print("All checks passed.")

# ── Build connectivity.ts ──────────────────────────────────────────────────
out = ['import type { ModelConnectivityErrorType, SupportedProvider } from "./index";\n\n']

for s, e in conn:
    chunk = extract(s, e)
    # export all declarations
    for prefix in [
        "const connectivityHostAllowList",
        "function parseExtraConnectivityHosts(",
        "function isAllowedHost(",
        "function assertConnectivityBaseUrlAllowed(",
        "function getErrorMessage(",
        "function isRecord(",
        "function classifyHttpErrorType(",
        "function classifyThrownErrorType(",
        "function classifySemanticErrorType(",
        "function hasOpenAiCompatibleMessage(",
        "function validateOpenAiCompatibleProbePayload(",
        "async function extractResponseDetail(",
        "interface ExtractedResponseDetail",
    ]:
        chunk = chunk.replace(prefix, "export " + prefix)
    out.append(chunk + "\n")

conn_text = "".join(out)
with open("src/server/modules/models/connectivity.ts", "w", encoding="utf-8") as f:
    f.write(conn_text)
print(f"Wrote connectivity.ts ({conn_text.count(chr(10))} lines)")

# ── Build admin-adapters.ts ────────────────────────────────────────────────
admin_header = """import type {
  ApiKeyChange,
  ModelConnectivityResult,
  ModelListItem,
  UpdateAdminModelPayload,
  UpdateModelInput
} from "./index";
import { createModelsModule } from "./index";

"""
admin_body = []
for s, e in admin:
    admin_body.append(extract(s, e) + "\n")

admin_text = admin_header + "".join(admin_body)
with open("src/server/modules/models/admin-adapters.ts", "w", encoding="utf-8") as f:
    f.write(admin_text)
print(f"Wrote admin-adapters.ts ({admin_text.count(chr(10))} lines)")

# ── Rebuild index.ts ──────────────────────────────────────────────────────
# Merge all ranges and de-duplicate overlapping line indices
removed = set()
for ranges in [conn, admin]:
    for s, e in ranges:
        for i in range(s - 1, e):
            removed.add(i)

new_lines = []
prev_blank = False
for i, line in enumerate(lines):
    if i in removed:
        continue
    blank = line.strip() == ""
    if blank and prev_blank:
        continue
    new_lines.append(line)
    prev_blank = blank

# Insert connectivity import after last import
last_imp = 0
for i, line in enumerate(new_lines):
    if line.startswith("import "):
        last_imp = i

imp = """
import {
  assertConnectivityBaseUrlAllowed,
  classifyHttpErrorType,
  classifySemanticErrorType,
  classifyThrownErrorType,
  extractResponseDetail,
  getErrorMessage,
  validateOpenAiCompatibleProbePayload
} from "./connectivity";
"""
new_lines.insert(last_imp + 1, imp)

# Re-export admin adapters at bottom
reexport = """
// ── Admin adapters (re-exported for backward compatibility) ──────────────
export {
  listAdminModels,
  listModels,
  setDefaultAdminModel,
  setDefaultModel,
  testAdminModelConnection,
  testModelConnectivity,
  updateAdminModel,
  updateModel
} from "./admin-adapters";
"""
new_lines.append(reexport)

new_text = "".join(new_lines)
with open(SRC, "w", encoding="utf-8") as f:
    f.write(new_text)
print(f"Rewrote index.ts ({new_text.count(chr(10))} lines, was {len(lines)})")
print("Done.")
#!/usr/bin/env python3
"""Extract connectivity helpers and admin adapters from models/index.ts.

Strategy: use line-number ranges (manually verified from the 955-line source)
rather than fragile AST-style function-end detection.
"""

SRC = "src/server/modules/models/index.ts"

with open(SRC, encoding="utf-8") as f:
    lines = f.readlines()

def extract(start_1based: int, end_1based: int) -> str:
    """Return text for lines [start, end] (1-based inclusive)."""
    return "".join(lines[start_1based - 1 : end_1based])

# ══════════════════════════════════════════════════════════════════════════
# CONNECTIVITY HELPERS  (pure functions used by testModelConnectivity)
# Manually verified line ranges from the 955-line original:
# ══════════════════════════════════════════════════════════════════════════
connectivity_ranges = [
    (195, 201),   # connectivityHostAllowList
    (216, 233),   # parseExtraConnectivityHosts (with doc comment)
    (235, 248),   # isAllowedHost (with doc comment)
    (250, 282),   # assertConnectivityBaseUrlAllowed (with doc comment)
    (356, 362),   # getErrorMessage
    (364, 366),   # isRecord
    (368, 396),   # classifyHttpErrorType (with doc comment)
    (398, 413),   # classifyThrownErrorType (with doc comment)
    (415, 428),   # classifySemanticErrorType
    (430, 462),   # hasOpenAiCompatibleMessage
    (464, 510),   # validateOpenAiCompatibleProbePayload
    (512, 516),   # ExtractedResponseDetail interface
    (518, 564),   # extractResponseDetail (with doc comment)
]

# ══════════════════════════════════════════════════════════════════════════
# ADMIN ADAPTERS  (singleton wrappers + admin route adapters)
# ══════════════════════════════════════════════════════════════════════════
admin_ranges = [
    (888, 891),   # getDefaultModelsModule
    (893, 895),   # listModels
    (897, 899),   # updateModel
    (901, 903),   # setDefaultModel
    (905, 907),   # testModelConnectivity
    (909, 930),   # toApiKeyChange
    (932, 935),   # listAdminModels (with doc comment)
    (936, 948),   # updateAdminModel
    (949, 951),   # setDefaultAdminModel
    (953, 955),   # testAdminModelConnection
]

# ── Verify ranges by spot-checking key lines ──────────────────────────────
def assert_contains(line_1based: int, snippet: str):
    actual = lines[line_1based - 1]
    if snippet not in actual:
        raise AssertionError(
            f"L{line_1based} expected to contain {snippet!r}, got: {actual.rstrip()!r}"
        )

assert_contains(195, "connectivityHostAllowList")
assert_contains(201, "};")
assert_contains(216, "功能：解析额外连通性测试白名单域名")
assert_contains(224, "function parseExtraConnectivityHosts(")
assert_contains(233, "}")
assert_contains(242, "function isAllowedHost(")
assert_contains(254, "function assertConnectivityBaseUrlAllowed(")
assert_contains(282, "}")
assert_contains(356, "function getErrorMessage(")
assert_contains(362, "}")
assert_contains(364, "function isRecord(")
assert_contains(375, "function classifyHttpErrorType(")
assert_contains(396, "}")
assert_contains(398, "function classifyThrownErrorType(")
assert_contains(413, "}")
assert_contains(415, "function classifySemanticErrorType(")
assert_contains(428, "}")
assert_contains(430, "function hasOpenAiCompatibleMessage(")
assert_contains(462, "}")
assert_contains(464, "function validateOpenAiCompatibleProbePayload(")
assert_contains(510, "}")
assert_contains(512, "interface ExtractedResponseDetail")
assert_contains(516, "}")
assert_contains(518, "功能：提取 provider 返回中的可读错误信息")
assert_contains(525, "async function extractResponseDetail(")
assert_contains(564, "}")
assert_contains(888, "async function getDefaultModelsModule()")
assert_contains(909, "function toApiKeyChange(")
assert_contains(932, "export async function listAdminModels()")
assert_contains(936, "export async function updateAdminModel(")
assert_contains(949, "export async function setDefaultAdminModel(")
assert_contains(953, "export async function testAdminModelConnection(")
assert_contains(955, "}")

print("All line-range assertions passed.")

# ── Build connectivity.ts ──────────────────────────────────────────────────
conn_parts = []
conn_parts.append('import type { ModelConnectivityErrorType, SupportedProvider } from "./index";\n\n')

for s, e in connectivity_ranges:
    chunk = extract(s, e)
    # Make all functions/interfaces/constants exported
    for name in [
        "const connectivityHostAllowList",
        "function parseExtraConnectivityHosts(",
        "function isAllowedHost(",
        "function assertConnectivityBaseUrlAllowed(",
        "function getErrorMessage(",
        "function isRecord(",
        "function classifyHttpErrorType(",
        "function classifyThrownErrorType(",
        "function classifySemanticErrorType(",
        "function hasOpenAiCompatibleMessage(",
        "function validateOpenAiCompatibleProbePayload(",
        "async function extractResponseDetail(",
        "interface ExtractedResponseDetail",
    ]:
        chunk = chunk.replace(name, "export " + name)
    conn_parts.append(chunk)
    conn_parts.append("\n")

connectivity_text = "".join(conn_parts)
with open("src/server/modules/models/connectivity.ts", "w", encoding="utf-8") as f:
    f.write(connectivity_text)
print(f"Wrote connectivity.ts ({connectivity_text.count(chr(10))} lines)")

# ── Build admin-adapters.ts ────────────────────────────────────────────────
admin_parts = []
admin_parts.append("""import type {
  ApiKeyChange,
  ModelConnectivityResult,
  ModelListItem,
  UpdateAdminModelPayload,
  UpdateModelInput
} from "./index";
import { createModelsModule } from "./index";

""")

for s, e in admin_ranges:
    admin_parts.append(extract(s, e))
    admin_parts.append("\n")

admin_text = "".join(admin_parts)
with open("src/server/modules/models/admin-adapters.ts", "w", encoding="utf-8") as f:
    f.write(admin_text)
print(f"Wrote admin-adapters.ts ({admin_text.count(chr(10))} lines)")

# ── Rebuild index.ts ──────────────────────────────────────────────────────
# Collect removed line indices (0-based)
removed = set()
for ranges_list in [connectivity_ranges, admin_ranges]:
    for s, e in ranges_list:
        for i in range(s - 1, e):
            removed.add(i)

# Build new lines, collapsing consecutive blanks
new_lines = []
prev_blank = False
for i, line in enumerate(lines):
    if i in removed:
        continue
    is_blank = line.strip() == ""
    if is_blank and prev_blank:
        continue
    new_lines.append(line)
    prev_blank = is_blank

# Find the last import statement to insert connectivity imports after it
last_import_idx = 0
for i, line in enumerate(new_lines):
    if line.startswith("import "):
        last_import_idx = i

conn_import_block = """
import {
  assertConnectivityBaseUrlAllowed,
  classifyHttpErrorType,
  classifySemanticErrorType,
  classifyThrownErrorType,
  extractResponseDetail,
  getErrorMessage,
  validateOpenAiCompatibleProbePayload
} from "./connectivity";
"""

new_lines.insert(last_import_idx + 1, conn_import_block)

# Append re-exports for admin adapters at the end
admin_reexport = """
// ── Admin adapters (re-exported for backward compatibility) ──────────────
export {
  listAdminModels,
  listModels,
  setDefaultAdminModel,
  setDefaultModel,
  testAdminModelConnection,
  testModelConnectivity,
  updateAdminModel,
  updateModel
} from "./admin-adapters";
"""
new_lines.append(admin_reexport)

new_text = "".join(new_lines)
with open(SRC, "w", encoding="utf-8") as f:
    f.write(new_text)

print(f"Rewrote index.ts ({new_text.count(chr(10))} lines, was {len(lines)})")
print("Done.")
#!/usr/bin/env python3
"""Extract connectivity helpers and admin adapters from models/index.ts."""
import re

SRC = "src/server/modules/models/index.ts"

with open(SRC, encoding="utf-8") as f:
    lines = f.readlines()

text = "".join(lines)

# ── helpers to locate line ranges ──────────────────────────────────────────
def find_line(pattern: str, start: int = 0) -> int:
    """Return 0-based line index of the first line matching `pattern`."""
    for i in range(start, len(lines)):
        if pattern in lines[i]:
            return i
    raise ValueError(f"Pattern not found: {pattern!r}")

def find_function_end(start: int) -> int:
    """Given the line index of 'function foo(' or its doc comment, find the closing '}'."""
    depth = 0
    in_body = False
    # First, skip past the function signature to find the actual function body opener.
    # A function body starts with '{' at depth 0 AFTER seeing the ')' that closes the params
    # and any return type annotation. We track if we've seen the function keyword.
    found_func = False
    paren_depth = 0
    past_signature = False
    for i in range(start, len(lines)):
        for j, ch in enumerate(lines[i]):
            if not found_func:
                # Look for 'function' keyword or '=>'
                rest = lines[i][j:]
                if rest.startswith('function ') or rest.startswith('function('):
                    found_func = True
                    continue
            if found_func and not past_signature:
                if ch == '(':
                    paren_depth += 1
                elif ch == ')':
                    paren_depth -= 1
                    if paren_depth == 0:
                        past_signature = True
                continue
            if past_signature:
                if ch == '{':
                    depth += 1
                    in_body = True
                elif ch == '}':
                    depth -= 1
                    if in_body and depth == 0:
                        return i
    raise ValueError(f"Could not find end of function starting at L{start+1}")

# ── identify sections to extract to connectivity.ts ───────────────────────
# Pure connectivity helpers (with their doc comments):
# 1. connectivityHostAllowList constant
# 2. parseExtraConnectivityHosts
# 3. isAllowedHost
# 4. assertConnectivityBaseUrlAllowed
# 5. getErrorMessage
# 6. isRecord
# 7. classifyHttpErrorType
# 8. classifyThrownErrorType
# 9. classifySemanticErrorType
# 10. hasOpenAiCompatibleMessage
# 11. validateOpenAiCompatibleProbePayload
# 12. ExtractedResponseDetail interface
# 13. extractResponseDetail

connectivity_sections = []

# connectivityHostAllowList
start = find_line("const connectivityHostAllowList")
end = find_function_end(start)  # uses { } matching which works for object literals too
connectivity_sections.append((start, end))

# parseExtraConnectivityHosts (with doc comment)
doc_start = find_line("解析额外连通性测试白名单域名")
# Go back to find the /** start
while not lines[doc_start].strip().startswith("/**"):
    doc_start -= 1
end = find_function_end(doc_start)
connectivity_sections.append((doc_start, end))

# isAllowedHost (with doc comment)
doc_start = find_line("判断目标域名是否命中允许列表")
while not lines[doc_start].strip().startswith("/**"):
    doc_start -= 1
end = find_function_end(doc_start)
connectivity_sections.append((doc_start, end))

# assertConnectivityBaseUrlAllowed (with doc comment)
doc_start = find_line("对连通性测试 BaseURL 做安全边界校验")
while not lines[doc_start].strip().startswith("/**"):
    doc_start -= 1
end = find_function_end(doc_start)
connectivity_sections.append((doc_start, end))

# getErrorMessage
start = find_line("function getErrorMessage(")
end = find_function_end(start)
connectivity_sections.append((start, end))

# isRecord
start = find_line("function isRecord(")
end = find_function_end(start)
connectivity_sections.append((start, end))

# classifyHttpErrorType (with doc comment)
doc_start = find_line("根据 HTTP 状态码归类模型连通性失败类型")
while not lines[doc_start].strip().startswith("/**"):
    doc_start -= 1
end = find_function_end(doc_start)
connectivity_sections.append((doc_start, end))

# classifyThrownErrorType (with doc comment)
doc_start = find_line("根据抛错信息兜底识别失败类型")
while not lines[doc_start].strip().startswith("/**"):
    doc_start -= 1
end = find_function_end(doc_start)
connectivity_sections.append((doc_start, end))

# classifySemanticErrorType
start = find_line("function classifySemanticErrorType(")
end = find_function_end(start)
connectivity_sections.append((start, end))

# hasOpenAiCompatibleMessage
start = find_line("function hasOpenAiCompatibleMessage(")
end = find_function_end(start)
connectivity_sections.append((start, end))

# validateOpenAiCompatibleProbePayload
start = find_line("function validateOpenAiCompatibleProbePayload(")
end = find_function_end(start)
connectivity_sections.append((start, end))

# ExtractedResponseDetail interface
start = find_line("interface ExtractedResponseDetail")
end = find_function_end(start)
connectivity_sections.append((start, end))

# extractResponseDetail (with doc comment)
doc_start = find_line("提取 provider 返回中的可读错误信息")
while not lines[doc_start].strip().startswith("/**"):
    doc_start -= 1
end = find_function_end(doc_start)
connectivity_sections.append((doc_start, end))

# Sort by start line
connectivity_sections.sort(key=lambda x: x[0])

print("Connectivity sections to extract:")
for s, e in connectivity_sections:
    print(f"  L{s+1}-L{e+1}: {lines[s].strip()[:60]}")

# ── identify sections for admin-adapters.ts ────────────────────────────────
admin_sections = []

# getDefaultModelsModule
start = find_line("async function getDefaultModelsModule()")
end = find_function_end(start)
admin_sections.append((start, end))

# listModels (standalone export)
start = find_line("export async function listModels()")
end = find_function_end(start)
admin_sections.append((start, end))

# updateModel (standalone export)
start = find_line("export async function updateModel(input")
end = find_function_end(start)
admin_sections.append((start, end))

# setDefaultModel (standalone export)
start = find_line("export async function setDefaultModel(id")
end = find_function_end(start)
admin_sections.append((start, end))

# testModelConnectivity (standalone export)
start = find_line("export async function testModelConnectivity(id")
end = find_function_end(start)
admin_sections.append((start, end))

# toApiKeyChange
start = find_line("function toApiKeyChange(")
end = find_function_end(start)
admin_sections.append((start, end))

# listAdminModels (with doc comment above)
doc_start = find_line("Admin route adapters")
while not lines[doc_start].strip().startswith("/**"):
    doc_start -= 1
end = find_function_end(find_line("export async function listAdminModels("))
admin_sections.append((doc_start, end))

# updateAdminModel
start = find_line("export async function updateAdminModel(")
end = find_function_end(start)
admin_sections.append((start, end))

# setDefaultAdminModel
start = find_line("export async function setDefaultAdminModel(")
end = find_function_end(start)
admin_sections.append((start, end))

# testAdminModelConnection
start = find_line("export async function testAdminModelConnection(")
end = find_function_end(start)
admin_sections.append((start, end))

admin_sections.sort(key=lambda x: x[0])

print("\nAdmin sections to extract:")
for s, e in admin_sections:
    print(f"  L{s+1}-L{e+1}: {lines[s].strip()[:60]}")

# ── Build connectivity.ts ──────────────────────────────────────────────────
connectivity_content = '''import type { ModelConnectivityErrorType, SupportedProvider } from "./index";

'''

for s, e in connectivity_sections:
    chunk = "".join(lines[s:e+1])
    # Make functions exported
    chunk = chunk.replace("function parseExtraConnectivityHosts(", "export function parseExtraConnectivityHosts(")
    chunk = chunk.replace("function isAllowedHost(", "export function isAllowedHost(")
    chunk = chunk.replace("function assertConnectivityBaseUrlAllowed(", "export function assertConnectivityBaseUrlAllowed(")
    chunk = chunk.replace("function getErrorMessage(", "export function getErrorMessage(")
    chunk = chunk.replace("function isRecord(", "export function isRecord(")
    chunk = chunk.replace("function classifyHttpErrorType(", "export function classifyHttpErrorType(")
    chunk = chunk.replace("function classifyThrownErrorType(", "export function classifyThrownErrorType(")
    chunk = chunk.replace("function classifySemanticErrorType(", "export function classifySemanticErrorType(")
    chunk = chunk.replace("function hasOpenAiCompatibleMessage(", "export function hasOpenAiCompatibleMessage(")
    chunk = chunk.replace("function validateOpenAiCompatibleProbePayload(", "export function validateOpenAiCompatibleProbePayload(")
    chunk = chunk.replace("async function extractResponseDetail(", "export async function extractResponseDetail(")
    chunk = chunk.replace("interface ExtractedResponseDetail", "export interface ExtractedResponseDetail")
    # Export constant
    chunk = chunk.replace("const connectivityHostAllowList", "export const connectivityHostAllowList")
    connectivity_content += chunk + "\n"

with open("src/server/modules/models/connectivity.ts", "w", encoding="utf-8") as f:
    f.write(connectivity_content)

print(f"\nWrote connectivity.ts ({connectivity_content.count(chr(10))} lines)")

# ── Build admin-adapters.ts ────────────────────────────────────────────────
admin_content = '''import type {
  ApiKeyChange,
  ModelConnectivityResult,
  ModelListItem,
  UpdateAdminModelPayload,
  UpdateModelInput
} from "./index";
import { createModelsModule } from "./index";

'''

for s, e in admin_sections:
    chunk = "".join(lines[s:e+1])
    admin_content += chunk + "\n"

with open("src/server/modules/models/admin-adapters.ts", "w", encoding="utf-8") as f:
    f.write(admin_content)

print(f"Wrote admin-adapters.ts ({admin_content.count(chr(10))} lines)")

# ── Rebuild index.ts ──────────────────────────────────────────────────────
# Collect all line ranges to remove (both connectivity and admin sections)
all_removed = sorted(connectivity_sections + admin_sections, key=lambda x: x[0])

# Build set of removed line indices
removed_lines = set()
for s, e in all_removed:
    for i in range(s, e + 1):
        removed_lines.add(i)

# Also remove blank lines that would be left between removed sections
# (clean up consecutive blank lines)
new_lines = []
prev_blank = False
for i, line in enumerate(lines):
    if i in removed_lines:
        continue
    is_blank = line.strip() == ""
    if is_blank and prev_blank:
        continue
    new_lines.append(line)
    prev_blank = is_blank

# Insert import for connectivity helpers + re-exports after the existing imports
# Find the last import line
last_import = 0
for i, line in enumerate(new_lines):
    if line.startswith("import "):
        last_import = i

# Build the new import + re-export lines
connectivity_import = '''
import {
  assertConnectivityBaseUrlAllowed,
  classifyHttpErrorType,
  classifySemanticErrorType,
  classifyThrownErrorType,
  extractResponseDetail,
  getErrorMessage,
  validateOpenAiCompatibleProbePayload
} from "./connectivity";

'''

# Insert after last import
new_lines.insert(last_import + 1, connectivity_import)

# Add re-exports at the end of the file for admin adapters
admin_reexport = '''
// ── Admin adapters (re-exported for backward compatibility) ──────────────
export {
  listAdminModels,
  listModels,
  setDefaultAdminModel,
  setDefaultModel,
  testAdminModelConnection,
  testModelConnectivity,
  updateAdminModel,
  updateModel
} from "./admin-adapters";
'''

new_lines.append(admin_reexport)

new_text = "".join(new_lines)

with open(SRC, "w", encoding="utf-8") as f:
    f.write(new_text)

print(f"Rewrote index.ts ({new_text.count(chr(10))} lines, was {len(lines)})")
print("Done.")
