# Best Practices

## Purpose and boundaries

Inspect storefront-next framework use, server loaders/actions, and production integrations. Follow data flow before judging a text match.

## Investigation sequence

Map routes and data boundaries, inspect every rule, and corroborate source conclusions with captured behavior.

## Evidence and redaction

Cite source lines and Playhouse diagnostics without secrets or personal data.

## Severity and blind spots

Opaque integrations without independent end-to-end evidence are `not-verified`.

## Draft rules and migration gaps

Application/data caching strategy, authenticated cache safety, observability, localization, resilient image handling, CSP integration, and framework-version-specific recommendations remain uncodified. Deployed public-resource caching is owned by `performance/cache-control`. Do not silently treat the remaining gaps as active rules; record relevant review as an ad hoc observation and coverage gap.
