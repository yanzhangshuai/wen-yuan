#!/usr/bin/env python3
"""
List active specs for the current project stage.

Usage:
    python3 list_specs.py                    List all active specs
    python3 list_specs.py --type frontend    List active frontend specs
    python3 list_specs.py --type backend     List active backend specs
    python3 list_specs.py --all              Include dormant specs
"""

from __future__ import annotations

import argparse

from common.stage import get_stage, list_specs


def main() -> None:
    parser = argparse.ArgumentParser(description="List specs for current stage")
    parser.add_argument("--type", "-t", choices=["frontend", "backend", "guides", "meta"],
                        help="Filter by spec type")
    parser.add_argument("--all", "-a", action="store_true", help="Include dormant specs")
    args = parser.parse_args()

    stage = get_stage()
    result = list_specs(spec_type=args.type, stage=stage)

    print(f"Stage: {stage}")
    print()

    if result["active"]:
        print(f"Active specs ({len(result['active'])}):")
        for item in result["active"]:
            print(f"  ✓ {item['path']}")
    else:
        print("Active specs: (none)")

    if args.all and result["dormant"]:
        print()
        print(f"Dormant specs ({len(result['dormant'])}):")
        for item in result["dormant"]:
            print(f"  ○ {item['path']} [requires: {item['stage']}]")

    print()
    total = len(result["active"]) + len(result["dormant"])
    print(f"Total: {len(result['active'])}/{total} active")


if __name__ == "__main__":
    main()
