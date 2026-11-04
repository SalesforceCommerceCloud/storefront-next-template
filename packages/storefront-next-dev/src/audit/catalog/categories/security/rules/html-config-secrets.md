---
id: security/html-config-secrets
title: Secrets in the Page's Config and Data
severity: critical
appliesTo: [home, plp, pdp]
inputs: [playhouse.scripts, playhouse.main-document, source.code, project.config]
---

## Intent
Checks the config and data the deployed site writes into each page's HTML for secrets, such as third-party API keys, client secrets, access tokens and passwords. Anything in the HTML can be read by every visitor, so a secret there must be treated as leaked. Unlike `security/public-client-secrets`, which reads the project's source, this checks what the live site actually sends, which includes values set as environment variables on Managed Runtime. Keys that are meant to be public, such as the Commerce API client id or a publishable payment key, are allowed.
## Inspect
The rule script lists the inline scripts Playhouse archived from each page's HTML (`data` file, paths relative to the page's `archiveDir`): `appConfig` (`window.__APP_CONFIG__`), `pageData` (React Router loader data) and `other` (every other inline script, such as analytics and tag snippets). Read all of them; secrets can have any property name and any format, so don't rely on names like `apiKey` or `secret` alone. Look at every value that looks like a credential: long random strings, tokens with known prefixes (`sk_`, `ghp_`, `xoxb-`, `AKIA`, `eyJ` for JWTs), URLs with credentials or tokens in them, private keys, and values under names like `key`, `token`, `secret`, `password`, `auth` or `credentials`. If a page has no archived scripts, `curl -sL <page url>` and read its inline scripts instead.

For each candidate, decide whether it is public by design. Public: the Commerce API (SLAS) public client id, organization id, short code and site id; analytics and tag manager ids; payment publishable or client keys (`pk_live_`, Adyen client keys); reCAPTCHA site keys; search-only keys (Algolia search keys); error-reporting DSNs; map and other browser keys meant to be restricted by referrer. Secret: SLAS private client secrets, Commerce API or OCAPI client passwords, payment secret keys (`sk_live_`), cloud credentials, webhook signing secrets, admin or write API keys, access or refresh tokens issued to the server, private keys and passwords. When the same vendor issues both, check the vendor's key type or format. Then find where the value comes from in the project (config schema, `config.server.ts`, environment variable names, loaders) so the finding can say what to move.
## Evaluate
Report a `finding` when a page's HTML contains a secret. Use the rule's severity for credentials that grant write, admin or account access, and lower it for a key that only grants read access to public data. Keys you can't classify with confidence are `info` findings that ask the customer to confirm the key type. Pass when every candidate is public by design, and cite what was reviewed. The same config usually appears on every page; cite it once and say so.
## Evidence
For each secret: the archived script that contains it (`playhouse`) with a `value` naming its location in the config or data (for example `engagement.adapters.reviews.apiKey`) and the key type, never the secret itself; and `source` evidence for where the project puts it into browser config or loader data. Replace the value with `[redacted]` everywhere, including in the summary and remediation.
## Remediation
Keep the secret on the server: read it in server-only code (loaders, actions or server middleware) instead of browser config, or call the third party through a server route. Then rotate the leaked secret, since anyone who loaded the page may have copied it.
## Examples
Compliant: `__APP_CONFIG__` with the SLAS public client id and a Stripe publishable key. Problematic: `__APP_CONFIG__` with a reviews vendor's write API key, or loader data with a server access token.
