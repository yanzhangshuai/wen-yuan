#!/usr/bin/env python3
"""
Stage management utilities.

Provides:
    VALID_STAGES       - Ordered list of valid stages
    STAGE_ORDER        - Stage precedence mapping
    get_stage          - Get current project stage from config.json
    set_stage          - Update project stage in config.json
    parse_spec_stage   - Parse stage frontmatter from a spec .md file
    list_specs         - List spec files filtered by current stage and optional type
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .paths import DIR_WORKFLOW, DIR_SPEC, get_repo_root

# =============================================================================
# Constants
# =============================================================================

VALID_STAGES = ["mvp", "growth", "mature"]
STAGE_ORDER = {name: idx for idx, name in enumerate(VALID_STAGES)}

CONFIG_FILE = "config.json"


# =============================================================================
# Read / Write Stage
# =============================================================================

def _get_config_path(repo_root: Path | None = None) -> Path:
    if repo_root is None:
        repo_root = get_repo_root()
    return repo_root / DIR_WORKFLOW / CONFIG_FILE


def get_config(repo_root: Path | None = None) -> dict:
    path = _get_config_path(repo_root)
    if not path.is_file():
        return {"stage": "mvp"}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"stage": "mvp"}


def get_stage(repo_root: Path | None = None) -> str:
    return get_config(repo_root).get("stage", "mvp")


def set_stage(new_stage: str, repo_root: Path | None = None) -> bool:
    if new_stage not in VALID_STAGES:
        return False
    if repo_root is None:
        repo_root = get_repo_root()
    config = get_config(repo_root)
    config["stage"] = new_stage
    path = _get_config_path(repo_root)
    try:
        path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return True
    except OSError:
        return False


# =============================================================================
# Parse Spec Frontmatter
# =============================================================================

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---", re.DOTALL)
_STAGE_RE = re.compile(r"^stage:\s*(.+)$", re.MULTILINE)


def parse_spec_stage(file_path: Path) -> str:
    """Parse the stage field from a spec file's YAML frontmatter.

    Returns the stage string (e.g. 'mvp', 'growth', 'mature').
    Defaults to 'mvp' if no frontmatter or no stage field found.
    """
    try:
        content = file_path.read_text(encoding="utf-8")
    except OSError:
        return "mvp"

    fm_match = _FRONTMATTER_RE.match(content)
    if not fm_match:
        return "mvp"

    stage_match = _STAGE_RE.search(fm_match.group(1))
    if not stage_match:
        return "mvp"

    return stage_match.group(1).strip().lower()


# =============================================================================
# List Specs
# =============================================================================

def list_specs(
    repo_root: Path | None = None,
    spec_type: str | None = None,
    stage: str | None = None,
) -> dict[str, list[dict[str, str]]]:
    """List spec files grouped by active/dormant based on project stage.

    Args:
        repo_root: Repository root.
        spec_type: Filter by subdirectory (frontend, backend, guides, meta). None = all.
        stage: Override stage. None = read from config.

    Returns:
        {"active": [...], "dormant": [...]}
        Each item: {"path": relative_path, "stage": file_stage}
    """
    if repo_root is None:
        repo_root = get_repo_root()

    if stage is None:
        stage = get_stage(repo_root)

    current_order = STAGE_ORDER.get(stage, 0)
    spec_dir = repo_root / DIR_WORKFLOW / DIR_SPEC

    if not spec_dir.is_dir():
        return {"active": [], "dormant": []}

    subdirs = [spec_type] if spec_type else ["frontend", "backend", "guides", "meta", "shared", "big-question"]
    active: list[dict[str, str]] = []
    dormant: list[dict[str, str]] = []

    for subdir in subdirs:
        sub_path = spec_dir / subdir
        if not sub_path.is_dir():
            continue

        for md_file in sorted(sub_path.glob("*.md")):
            if not md_file.is_file():
                continue

            file_stage = parse_spec_stage(md_file)
            relative = f"{DIR_WORKFLOW}/{DIR_SPEC}/{subdir}/{md_file.name}"
            entry = {"path": relative, "stage": file_stage}

            file_order = STAGE_ORDER.get(file_stage, 0)
            if file_order <= current_order:
                active.append(entry)
            else:
                dormant.append(entry)

    return {"active": active, "dormant": dormant}


def get_spec_summary(repo_root: Path | None = None) -> dict:
    """Get a summary of spec activation status.

    Returns:
        {"stage": str, "active_count": int, "total_count": int}
    """
    if repo_root is None:
        repo_root = get_repo_root()

    stage = get_stage(repo_root)
    result = list_specs(repo_root, stage=stage)
    total = len(result["active"]) + len(result["dormant"])
    return {
        "stage": stage,
        "active_count": len(result["active"]),
        "total_count": total,
    }
