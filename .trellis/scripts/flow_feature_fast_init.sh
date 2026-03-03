#!/usr/bin/env bash
set -euo pipefail

exec bash .trellis/scripts/flow_feature_init.sh --strategy fast "$@"
