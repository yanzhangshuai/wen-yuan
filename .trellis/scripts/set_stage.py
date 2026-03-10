#!/usr/bin/env python3
"""
Set project stage.

Usage:
    python3 set_stage.py <stage>
    python3 set_stage.py mvp|growth|mature
"""

from __future__ import annotations

import sys

from common.stage import VALID_STAGES, get_stage, set_stage, get_spec_summary


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(f"Usage: python3 set_stage.py <{'|'.join(VALID_STAGES)}>")
        print()
        print("Stages:")
        print("  mvp     - Core specs only (~10 files)")
        print("  growth  - Add collaboration & quality specs")
        print("  mature  - All specs activated")
        sys.exit(0)

    new_stage = sys.argv[1].lower()
    if new_stage not in VALID_STAGES:
        print(f"Error: Invalid stage '{new_stage}'. Must be one of: {', '.join(VALID_STAGES)}", file=sys.stderr)
        sys.exit(1)

    old_stage = get_stage()
    if old_stage == new_stage:
        print(f"Stage is already '{new_stage}'.")
        sys.exit(0)

    if not set_stage(new_stage):
        print("Error: Failed to update config.json", file=sys.stderr)
        sys.exit(1)

    summary = get_spec_summary()
    print(f"Stage updated: {old_stage} → {new_stage} ({summary['active_count']}/{summary['total_count']} specs active)")


if __name__ == "__main__":
    main()
