# Verified Release Packages

A release package binds the built storefront, cartridge output, and optional
migration artifacts to one source commit. It is the input to every supported
deployment target: `test`, `development`, and `staging`. Production remains a
manual release-operator handoff, including Commerce code replication.

## Create a package

After building the storefront and cartridges, create a package from the project
root:

```sh
bash scripts/ci/package-release.sh <release-id> <source-commit>
```

The script requires `build/` and `cartridges/`, creates compressed archives in
`release-artifacts/`, optionally includes `migrations/`, writes `manifest.json`,
and verifies every artifact before succeeding.

The manifest contains a schema version, release ID, source commit, and one
filename and SHA-256 checksum for each artifact. Artifact filenames must be
safe relative names; the manifest cannot reference files outside its directory.

## Verify a package

`release-artifacts.mjs` exposes the package operations used by CI:

```sh
node scripts/ci/release-artifacts.mjs verify-manifest release-artifacts/manifest.json
node scripts/ci/release-artifacts.mjs verify-release release-artifacts/manifest.json <release-id> <source-commit>
node scripts/ci/release-artifacts.mjs artifact-path release-artifacts/manifest.json build
node scripts/ci/release-artifacts.mjs release-id release-artifacts/manifest.json
```

`verify-manifest` validates the manifest structure and recomputes every
artifact checksum. `verify-release` also requires the expected release ID and
source commit, preventing a valid package from being deployed for the wrong
revision.

## Deploy a package

```sh
bash scripts/ci/deploy-release.sh <test|development|staging> <release-id> <source-commit> [manifest]
```

Deployment always follows this order:

1. Validate package checksums, release ID, and source commit.
2. Deploy cartridges.
3. Verify, but do not run, an optional migrations artifact.
4. Deploy the Managed Runtime build.

Cartridge deployment logs a skip when `SFCC_SERVER`, `SFCC_CLIENT_ID`, or
`SFCC_CLIENT_SECRET` is absent. It requires WebDAV access and activates the
code version through an API client with the `sfcc.scripts.rw` scope; the CLI can
fall back to OCAPI where configured.

MRT deployment logs a skip when neither a legacy API key nor usable SCAPI
credentials are available. Select its authentication with `MRT_BACKEND`:

| Mode | Required configuration |
| --- | --- |
| `legacy` | `MRT_API_KEY` |
| `scapi` | `SFCC_CLIENT_ID`, `SFCC_CLIENT_SECRET`, `SFCC_SHORTCODE`, `SFCC_TENANT_ID` |
| `auto` | Uses SCAPI when all SCAPI credentials are present; otherwise requires `MRT_API_KEY` |

All MRT modes also require `MRT_PROJECT` and `MRT_ENVIRONMENT` (or the legacy
`MRT_TARGET`). See the [configuration guide](./README-CONFIG.md) and the
[deployment guide](https://www.npmjs.com/package/@salesforce/storefront-next-dev?activeTab=readme)
for the complete configuration and CLI behavior.
