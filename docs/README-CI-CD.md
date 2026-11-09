# CI/CD

GitHub Actions and Bitbucket Pipelines validate pull requests with lint, type
checking, unit tests, bundle-size validation, and advisory Lighthouse checks.
Production deployment and Commerce code replication remain a manual
release-operator handoff.

| Trigger | Behavior |
| --- | --- |
| Pull request | Runs quality validation only. It never selects a GitHub Environment or receives deployment credentials. |
| Push to `latest` | Builds and verifies a release package, then deploys it to Test. |
| Manual **Deploy Latest to Test** from `latest` | Repeats the automatic Test flow for controlled recovery. The workflow fails before package creation or environment selection when run from another ref. |
| Push of a `release-*` tag | Validates and packages a release candidate without deploying it. |
| Manual **Promote Release Tag** from a `release-*` tag | Deploys the selected tag to Development or Staging. |

## Lighthouse Routes

Fast Setup configures the Lighthouse PR preview with public, repository-level
Commerce API variables. It must also set `LIGHTHOUSE_PATHS` to comma-separated,
site- and locale-prefixed routes that return 2xx from the target instance:

```text
LIGHTHOUSE_PATHS=/Furniture/en-US/,/Furniture/en-US/cart
```

Do not use RefArch site names, locales, products, or categories unless they are
valid for the target. Add product or category routes only after verifying stable
target-specific fixtures. Update `LIGHTHOUSE_PATHS` whenever site or locale
routing changes. The `/,/cart` default is a compatibility and local fallback,
not a generated-store routing contract.

Generated repositories retain the template's strict Lighthouse assertions. If a
storefront needs different measured thresholds, change and version-control its
own `lighthouserc.cjs`; Fast Setup does not relax the default profile.

## GitHub Environments

Set the repository-level Actions variable `DEPLOY_ENVIRONMENT_NAMES` to map
logical stages to existing GitHub Environments. It replaces the former
`SFCC_DEPLOYMENT_ENVIRONMENT` workflow setting.

See [Migrate to the GitHub RC Pipeline](./migrations/github-rc-pipeline/README.md)
when updating an existing repository.

```json
{
  "Test": "realm_sandbox_storefront",
  "Development": "realm_development_storefront",
  "Staging": "realm_staging_storefront"
}
```

The mapping is repository-level so it can be resolved before a workflow selects
an environment. `Test` is required for `latest` deployment. Development and
Staging are required only when promoting to those stages. Missing, invalid, or
empty mappings fail before environment selection.

Create each mapped GitHub Environment before enabling deployment. Configure its
approval rules, target-specific variables, and secrets on that environment;
the workflows do not create environments or infer stage assignments. The
environment supplies Commerce and MRT deployment configuration, including
credentials used by the selected authentication mode.

See [Verified Release Packages](./README-RELEASE-PACKAGES.md) for package
contents, checksums, source-commit verification, and deployment behavior.
## Bitbucket Pipelines

The included `bitbucket-pipelines.yml` provides the same release flow without
requiring Bitbucket Premium:

| Trigger | Behavior |
| --- | --- |
| Pull request | Runs quality validation only. It has no deployment steps. |
| Push to `latest` | Builds one verified release package and deploys it to the existing Test target. |
| Custom **deploy-storefront** on `latest` | Repeats the Test flow for controlled recovery. It fails from any other branch. |
| Push of a `release-*` tag | Builds and verifies a release candidate, then exposes a manual Staging deployment step. |

The advisory Lighthouse step reads `LIGHTHOUSE_BASE_URL` and
`LIGHTHOUSE_PATHS` from repository variables. Configure target-valid,
site- and locale-prefixed paths as described in [Lighthouse Routes](#lighthouse-routes);
these variables do not select a Bitbucket Deployment environment.

The release package is transferred only within its pipeline run. Each
deployment calls `deploy-release.sh`, which validates the manifest, release ID,
source commit, and checksums before deploying cartridge and MRT output. The
manual promotion steps exist only in the `release-*` tag pipeline, so they do
not accept a branch or arbitrary ref.

Bitbucket Cloud Free has provider-specific limits: workspaces receive 50 build
minutes per month; Pipelines do not run for fork pull requests; and a
same-repository pull request also runs its source branch's default pipeline,
which can duplicate build-minute consumption.

Fast Setup configures repository variables for the initial Test target. The
pipeline binds the automatic and recovery Test steps to the existing `Test`
Bitbucket Deployment environment; that environment can use the Fast Setup
repository variables without defining overrides.

To configure a distinct Staging destination, create the `Staging` Bitbucket
Deployment environment and set its target-specific secured Deployment
variables. Deployment variables override repository and workspace defaults for
that step. Configure values that differ from Test, including `MRT_PROJECT`,
`MRT_TARGET` or `MRT_ENVIRONMENT`, `MRT_API_KEY`, `SFCC_SERVER`,
`SFCC_CLIENT_ID`, and `SFCC_CLIENT_SECRET`. Until those overrides are
configured, the Staging step falls back to the Test repository defaults and
must not be treated as a distinct-target promotion.

After configuring a distinct target, create and push an immutable `release-*`
tag, then start the manual Staging step from its tag pipeline. An ordinary step
name or arbitrary `ENVIRONMENT` input is informational only: it does not select
credentials, grant approval, or replace the `deployment:` binding.

Bitbucket Free supports Deployment variables and manual steps, but its custom
per-environment deployment permissions and deployment branch restrictions
require Bitbucket Premium. Do not represent a manual step as an approval or
credential boundary on Free. `DEPLOY_ENVIRONMENT_NAMES` is GitHub-only; GitHub
uses it to map logical stages to Environment names, while Bitbucket selects its
Deployment environment directly in `bitbucket-pipelines.yml`.
