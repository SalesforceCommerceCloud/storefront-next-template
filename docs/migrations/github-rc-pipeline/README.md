# Migrate to the GitHub RC Pipeline

Use this guide when upgrading an existing storefront from the v1.4 GitHub
deployment workflow to the release-candidate pipeline.

## Before You Start

The new workflows deploy from a verified release package and use GitHub
Environments for deployment credentials. Pull requests validate quality only;
`latest` deploys to Test; `release-*` tags are promoted manually to Development
and Staging. Production remains a manual handoff.

## Migrate Test

1. In **Settings > Secrets and variables > Actions > Variables**, find the
   existing `SFCC_DEPLOYMENT_ENVIRONMENT` value.
2. In **Settings > Environments**, confirm that Environment still exists and
   contains the intended Test target's variables and secrets.
3. Create the repository-level Actions variable `DEPLOY_ENVIRONMENT_NAMES`:

   ```json
   {
     "Test": "<SFCC_DEPLOYMENT_ENVIRONMENT value>"
   }
   ```

4. Push the RC pipeline workflows and run **Actions > Deploy Latest to Test**
   from `latest`.
5. Confirm the workflow packages a release, deploys the expected cartridge code
   version, and deploys the expected Managed Runtime target.
6. Delete `SFCC_DEPLOYMENT_ENVIRONMENT`. The RC pipeline does not read it.

Do not add Development or Staging mappings until their GitHub Environments,
target-specific configuration, and release process are ready.

## Add Later Stages

Extend the same repository-level mapping only after creating and configuring
the corresponding GitHub Environments:

```json
{
  "Test": "realm_sandbox_storefront",
  "Development": "realm_development_storefront",
  "Staging": "realm_staging_storefront"
}
```

The names are GitHub Environment names, not required logical-stage names. The
workflow selects them only after resolving the logical Test, Development, or
Staging stage.

## Troubleshooting

| Failure | Resolution |
| --- | --- |
| `DEPLOY_ENVIRONMENT_NAMES must contain a non-empty test mapping.` | Add a non-empty `Test` mapping as a repository-level Actions variable. |
| Configured environment does not exist | Create the named GitHub Environment before rerunning. |
| MRT or cartridge deployment skips or fails | Check the variables and secrets on the selected GitHub Environment, not repository-level configuration. |
| `MRT_CLOUD_ORIGIN` is ignored | It applies only to legacy MRT deployments. The SCAPI backend selects its endpoint from SCAPI configuration. |

See [CI/CD](../../README-CI-CD.md) for the workflow model and [Verified Release
Packages](../../README-RELEASE-PACKAGES.md) for release-artifact behavior.
