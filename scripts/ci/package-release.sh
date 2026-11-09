#!/usr/bin/env bash

# Create the paired release artifact consumed by every supported CI provider.
set -euo pipefail

release_id=${1:-}
source_commit=${2:-}
artifact_directory=${3:-release-artifacts}

if [[ -z "$release_id" || -z "$source_commit" ]]; then
    echo "Usage: scripts/ci/package-release.sh <release-id> <source-commit> [artifact-directory]" >&2
    exit 2
fi

for directory in build cartridges; do
    if [[ ! -d "$directory" ]]; then
        echo "Cannot package release: required $directory/ output is missing." >&2
        exit 1
    fi
done

release_slug=$(printf '%s' "$release_id" | tr -c 'A-Za-z0-9._-' '-')
mkdir -p "$artifact_directory"

create_archive() {
    local source_directory=$1
    local archive_path=$2

    tar -czf "$archive_path" "$source_directory"
}

build_archive="$artifact_directory/build-$release_slug.tar.gz"
cartridges_archive="$artifact_directory/cartridges-$release_slug.tar.gz"
create_archive build "$build_archive"
create_archive cartridges "$cartridges_archive"

manifest_args=(
    create-manifest
    "$release_id"
    "$source_commit"
    "$artifact_directory"
    "$build_archive"
    "$cartridges_archive"
)

if [[ -d migrations ]]; then
    migrations_archive="$artifact_directory/migrations-$release_slug.tar.gz"
    create_archive migrations "$migrations_archive"
    manifest_args+=("$migrations_archive")
fi

node scripts/ci/release-artifacts.mjs "${manifest_args[@]}"
node scripts/ci/release-artifacts.mjs verify-manifest "$artifact_directory/manifest.json"
