#!/usr/bin/env python3
"""
Get or list project stage and spec activation status.

Usage:
    python3 get_stage.py              Show current stage summary
    python3 get_stage.py --list       Show all specs grouped by stage
    python3 get_stage.py --json       Output in JSON format
"""

from __future__ import annotations

import argparse
import json

from common.stage import VALID_STAGES, get_stage, list_specs, get_spec_summary


def _output_summary() -> None:
    summary = get_spec_summary()
    stage = summary["stage"]
    active = summary["active_count"]
    total = summary["total_count"]
    print(f"Current stage: {stage} ({active}/{total} specs active)")


def _output_list() -> None:
    summary = get_spec_summary()
    stage = summary["stage"]

    print(f"Current stage: {stage}")
    print()

    # Group all specs by their own stage
    all_specs = list_specs()
    by_stage: dict[str, list[str]] = {s: [] for s in VALID_STAGES}

    for item in all_specs["active"] + all_specs["dormant"]:
        by_stage.setdefault(item["stage"], []).append(item["path"])

    for s in VALID_STAGES:
        is_current = s == stage
        from common.stage import STAGE_ORDER
        is_active = STAGE_ORDER[s] <= STAGE_ORDER[stage]
        marker = " (current)" if is_current else ""
        unlock_hint = "" if is_active else f"  (unlock with: set_stage.py {s})"
        print(f"{s}{marker}:{unlock_hint}")

        files = by_stage.get(s, [])
        if not files:
            print("  (no specs)")
        else:
            for f in files:
                icon = "✓" if is_active else "○"
                print(f"  {icon} {f}")
        print()


def _output_json() -> None:
    summary = get_spec_summary()
    specs = list_specs()
    print(json.dumps({"summary": summary, "specs": specs}, indent=2, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="Get project stage and spec status")
    parser.add_argument("--list", "-l", action="store_true", help="List all specs by stage")
    parser.add_argument("--json", "-j", action="store_true", help="JSON output")
    args = parser.parse_args()

    if args.json:
        _output_json()
    elif args.list:
        _output_list()
    else:
        _output_summary()


if __name__ == "__main__":
    main()
