#!/usr/bin/env bash

# Verify and deploy a paired release. Production is intentionally excluded: it
# remains a manual release-operator handoff, including Commerce code replication.
# Migrations are verified but intentionally not executed until the template
# adopts a migration format and runner.
set -euo pipefail

target=${1:-}
expected_release_id=${2:-}
expected_source_commit=${3:-}
manifest=${4:-release-artifacts/manifest.json}

case "$target" in
    test|development|staging) ;;
    *)
        echo "Unsupported deployment target: ${target:-<empty>}. Supported targets are test, development, and staging." >&2
        exit 2
        ;;
esac

if [[ -z "$expected_release_id" || -z "$expected_source_commit" ]]; then
    echo "Usage: scripts/ci/deploy-release.sh <test|development|staging> <release-id> <source-commit> [manifest]" >&2
    exit 2
fi

node scripts/ci/release-artifacts.mjs verify-release "$manifest" "$expected_release_id" "$expected_source_commit"

bash scripts/ci/deploy-cartridges.sh "$manifest"

if node scripts/ci/release-artifacts.mjs artifact-path "$manifest" migrations >/dev/null 2>&1; then
    echo "Verified migrations artifact is present. No migration runner is configured, so it will not be executed."
fi

bash scripts/ci/deploy-mrt.sh "$manifest"
