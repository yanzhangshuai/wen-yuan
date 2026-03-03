# Bilingual Document Naming & Sync Template

## 1) Naming Convention

- Primary document: `<name>.md` (source of truth for agents)
- Mirror document: `<name>.zh.md` (human-readable Chinese mirror)
- Optional snapshot: `<name>.en.md` (migration/archive use only)

Examples:

- `AGENTS.md` + `AGENTS.zh.md`
- `GEMINI.md` + `GEMINI.zh.md`

## 2) Language Policy

- Team may choose English or Chinese for the primary `.md`, but the choice must be explicit and stable.
- The mirror file must remain semantically aligned with the primary file.

## 3) Sync Workflow

1. Update the primary document first.
2. Sync changes to the mirror document.
3. Update sync metadata blocks in both files.
4. Run a quick diff review to ensure no key section is missing.

## 4) Minimal Metadata Block

Primary (`.md`) should include:

- Role
- Canonical path
- Mirror path
- Last synced date
- Sync owner

Mirror (`.zh.md`) should include:

- 角色
- 主文档路径
- 镜像文档路径
- 最后同步日期
- 同步人
