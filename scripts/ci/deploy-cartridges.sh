#!/usr/bin/env bash

# Deploy cartridge output extracted from a verified release artifact.
set -euo pipefail

manifest=${1:-release-artifacts/manifest.json}

client_id=${SFCC_CLIENT_ID:-${PUBLIC__app__commerce__api__clientId:-}}
if [[ -z "${SFCC_SERVER:-}" || -z "$client_id" || -z "${SFCC_CLIENT_SECRET:-}" ]]; then
    echo "Cartridge deployment skipped: configure SFCC_SERVER, SFCC_CLIENT_ID, and SFCC_CLIENT_SECRET."
    exit 0
fi

node scripts/ci/release-artifacts.mjs verify-manifest "$manifest"
cartridges_archive=$(node scripts/ci/release-artifacts.mjs artifact-path "$manifest" cartridges)
release_id=$(node scripts/ci/release-artifacts.mjs release-id "$manifest")
extract_directory=$(mktemp -d)
trap 'rm -rf "$extract_directory"' EXIT
tar -xzf "$cartridges_archive" -C "$extract_directory"

if [[ -n "${SFCC_CODE_VERSION:-}" ]]; then
    code_version=$SFCC_CODE_VERSION
else
    ref_name=${CI_REF_NAME:-${GITHUB_REF_NAME:-${BITBUCKET_TAG:-${BITBUCKET_BRANCH:-release}}}}
    short_commit=${CI_SOURCE_COMMIT:-${GITHUB_SHA:-${BITBUCKET_COMMIT:-$release_id}}}
    short_commit=${short_commit:0:7}
    safe_ref_name=$(printf '%s' "$ref_name" | tr -c 'A-Za-z0-9._-' '-')
    code_version="${safe_ref_name}_$(date -u +%Y%m%d_%H%M%S)_${short_commit}"
fi

SFCC_CLIENT_ID="$client_id" pnpm cartridge:deploy \
    --project-directory "$extract_directory" \
    --code-version "$code_version" \
    --reload
