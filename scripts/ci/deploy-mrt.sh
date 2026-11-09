#!/usr/bin/env bash

# Push storefront output extracted from a verified release artifact.
set -euo pipefail

manifest=${1:-release-artifacts/manifest.json}
client_id=${SFCC_CLIENT_ID:-${PUBLIC__app__commerce__api__clientId:-}}
backend=${MRT_BACKEND:-legacy}

missing_scapi=()
[[ -n "$client_id" ]] || missing_scapi+=(SFCC_CLIENT_ID)
[[ -n "${SFCC_CLIENT_SECRET:-}" ]] || missing_scapi+=(SFCC_CLIENT_SECRET)
[[ -n "${SFCC_SHORTCODE:-}" ]] || missing_scapi+=(SFCC_SHORTCODE)
[[ -n "${SFCC_TENANT_ID:-}" ]] || missing_scapi+=(SFCC_TENANT_ID)

if [[ "$backend" == scapi && ${#missing_scapi[@]} -gt 0 ]]; then
    echo "MRT_BACKEND is scapi but these variables are missing: ${missing_scapi[*]}." >&2
    exit 1
fi

has_scapi=false
if { [[ "$backend" == scapi || "$backend" == auto ]]; } && [[ ${#missing_scapi[@]} -eq 0 ]]; then
    has_scapi=true
fi
if [[ -z "${MRT_API_KEY:-}" && "$has_scapi" != true ]]; then
    echo "MRT deployment skipped: configure MRT_API_KEY, or MRT_BACKEND=scapi/auto with complete SCAPI credentials."
    exit 0
fi

target=${MRT_ENVIRONMENT:-${MRT_TARGET:-}}
if [[ -z "$target" ]]; then
    echo "MRT deployment requires MRT_ENVIRONMENT or MRT_TARGET; refusing to assume a destination." >&2
    exit 1
fi
if [[ -z "${MRT_PROJECT:-}" ]]; then
    echo "MRT deployment requires MRT_PROJECT." >&2
    exit 1
fi

node scripts/ci/release-artifacts.mjs verify-manifest "$manifest"
build_archive=$(node scripts/ci/release-artifacts.mjs artifact-path "$manifest" build)
release_id=$(node scripts/ci/release-artifacts.mjs release-id "$manifest")
extract_directory=$(mktemp -d)
trap 'rm -rf "$extract_directory"' EXIT
tar -xzf "$build_archive" -C "$extract_directory"

message=${MESSAGE:-${CI_REF_NAME:-${GITHUB_REF_NAME:-${BITBUCKET_TAG:-$release_id}}}}
push_args=(
    --build-directory "$extract_directory/build"
    --project "$MRT_PROJECT"
    --environment "$target"
    --message "$message"
    --wait
)
if [[ -n "${MRT_CLOUD_ORIGIN:-}" && "$has_scapi" != true ]]; then
    push_args+=(--cloud-origin "$MRT_CLOUD_ORIGIN")
fi

SFCC_CLIENT_ID="$client_id" pnpm push "${push_args[@]}"
