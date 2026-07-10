# Compatibility Matrix

Storefront Next has two parts that are versioned separately:

- **SDK** (`@salesforce/storefront-next-dev` + `@salesforce/storefront-next-runtime`) — the npm packages your storefront depends on, versioned with SemVer (e.g. 1.0, 1.5, 2.0).
- **Template** (this project) — released as a dated snapshot (e.g. "June 2026"). You own and customize the template after generating your project, so it's identified by *when* it shipped rather than a SemVer number.

Use the table below to find the SDK version your template release needs.

<!-- COMPAT:START -->
| Template stamp | `templateVersion` | Min SDK |
|---|---|---|
| July 2026 | `2026.7.0` | 1.1.0 |
| June 2026 | `2026.6.1` | 1.0.1 |
<!-- COMPAT:END -->

## How to read this

- **Template stamp** — the release label (e.g. "June 2026"). Find yours under `storefrontNext.templateRelease` in your project's `package.json`.
- **`templateVersion`** — the exact version of the template release. The format is `YYYY.M.patch`, where the third segment is a patch counter (almost always `0`), **not** a day of the month — `2026.6.2` is "June 2026, patch 2", not "June 2nd, 2026". A non-zero patch only appears for the rare case of a second release in the same month.
- **Min SDK** — the SDK version this template release was built and tested against. Install this version; newer SDK patch and minor releases are expected to work too.
