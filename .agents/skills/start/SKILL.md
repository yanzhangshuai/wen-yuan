---
name: start
description: "Start Session"
---

# Start Session

Initialize your AI development session and route work into the Trellis + Spec-Kit flow.

---

## Operation Types

| Marker | Meaning | Executor |
|--------|---------|----------|
| `[AI]` | Bash/scripts run by AI | You (AI) |
| `[USER]` | Skills run by user | User |

---

## Initialization `[AI]`

### Step 1: Read Workflow

```bash
cat .trellis/workflow.md
```

### Step 2: Get Current Context

```bash
python3 ./.trellis/scripts/get_context.py
```

### Step 3: Read Guideline Indexes

```bash
cat .trellis/spec/frontend/index.md
cat .trellis/spec/backend/index.md
cat .trellis/spec/guides/index.md
```

### Step 4: Report and Ask

Briefly report context and ask: **"What would you like to work on?"**

---

## Task Classification

| Type | Criteria | Workflow |
|------|----------|----------|
| **Question** | User asks architecture/code understanding | Answer directly |
| **Trivial Fix** | Tiny low-risk edit (<5 min) | flow-lite |
| **Feature / Non-trivial** | Multi-file, risk, or requirement work | flow-feature (Speed default) |
| **Known Bug** | Existing defect with clear reproduction | flow-bug |

### Decision Rule

> If uncertain between speed and strict, start with **Speed Strategy** and apply the mandatory upgrade rule when risk appears.

---

## Main Workflows

### 1) flow-lite (tiny low-risk)

```text
/trellis:start
/speckit.implement
$finish-work
# Ask whether to run $record-session
```

### 2) flow-feature (default for non-trivial)

#### Speed Strategy (default)

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy fast "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
python3 ./.trellis/scripts/task.py flow-confirm --compact --preview 8
# Wait for explicit user decision: 执行 / 修改：...
/speckit.implement
# Essential checks: success + failure + boundary
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
# Ask whether to run $record-session
```

#### Strict Strategy

```text
/trellis:start
bash .trellis/scripts/flow_feature_init.sh --strategy strict "<requirement>" [task-dir] [--stack "<tech-stack>"] [--req-doc <requirement-doc>] [--stack-doc <tech-stack-doc>]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
# Wait for explicit user decision: 执行 / 修改：...
/speckit.implement
python3 ./.trellis/scripts/task.py flow-guard --verify
$finish-work
# Ask whether to run $record-session
```

### 3) flow-bug (known bug)

```text
/trellis:start
/speckit.specify
/speckit.clarify
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
# Wait for explicit user decision: 执行 / 修改：...
/speckit.implement
/trellis:break-loop
$finish-work
# Ask whether to run $record-session
```

---

## Mandatory Upgrade Rule (Fast -> Strict)

Immediately switch to Strict Strategy when any appears:

1. Ambiguous requirement or acceptance criteria
2. Cross-layer contract changes (API/Action/DB signature, payload, env)
3. Elevated delivery risk (high impact / hard rollback / unknown dependency)

Upgrade template:

```text
bash .trellis/scripts/flow_feature_upgrade_docs.sh [task-dir]
/speckit.specify
/speckit.clarify
/speckit.plan
/speckit.tasks
python3 ./.trellis/scripts/task.py flow-confirm
/speckit.implement
```

---

## Task Edit Inputs

- Natural language: `修改：...`
- Structured ops: `+ / - / ~ / > / !`
- Command: `python3 ./.trellis/scripts/task.py flow-edit-tasks "<ops>"`

---

## Skill Reference

### User Skills `[USER]`

| Skill | When to Use |
|-------|-------------|
| `$start` | Begin session |
| `$finish-work` | Before commit |
| `$record-session` | After completion |

### AI Scripts `[AI]`

| Script | Purpose |
|--------|---------|
| `python3 ./.trellis/scripts/get_context.py` | Session context |
| `python3 ./.trellis/scripts/task.py flow-confirm` | Pre-implement confirmation gate |
| `python3 ./.trellis/scripts/task.py flow-guard --verify` | Finish gate with verification evidence |
| `python3 ./.trellis/scripts/task.py flow-edit-tasks` | Structured task edits |

---

## Key Principle

> Keep one primary path: `ff-fast` (default) and `ff-full` (upgrade/forced strict).
> Reduce branchy process text; keep gates strict.
