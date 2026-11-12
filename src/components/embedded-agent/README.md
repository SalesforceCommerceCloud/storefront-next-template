# Embedded Agent (Inline PDP `<inline-agent-widget>`)

Loads the inline PDP agent widget from a UMD bundle (`inline-agent-widget.umd.js`) that registers the `<inline-agent-widget>` custom element. Unlike the floating [Cimulate shopper-agent](../cimulate/README.md), this widget renders inline on the PDP and seeds opener-question pills + a product-grounded InputBar placeholder from SCAPI product data.

## Configure

Set one environment variable with the full config as a JSON string:

`PUBLIC__app__commerce__embeddedAgent`

### Required keys

- `enabled` — `true` or `"true"` to render the widget.
- `scrt2Url` — Core-Agent SCRT2 endpoint from the Embedded Service Deployment.
- `orgId` — Salesforce 18-char org ID.
- `esDeveloperName` — Developer name of the Embedded Service Deployment.

### Optional keys

- `placeholder` — Overrides the InputBar placeholder when no `productName` is seeded.
- `persistSession` — Pass `false` to disable session persistence. Default `true`.
- `enableLogging` — Pass `true` to enable widget-side console logging.
- `cc_embeddedWidgetCdnVersion` — Inline widget CDN release version. Default `"0.1.0"`.
- `embeddedWidgetSourceUrl` — Optional HTTPS inline-widget UMD URL on `cdn.search.cimulate.ai`. Empty/unset by default. A valid override takes precedence over the version. Invalid URLs use the selected version.
- `capabilitiesVersion` — Capability-matrix version. Defaults to `66`.

### Example

```json
{
  "enabled": "true",
  "cc_embeddedWidgetCdnVersion": "0.1.0",
  "embeddedWidgetSourceUrl": "",
  "scrt2Url": "https://your-org.salesforce-scrt.com",
  "orgId": "00Dxx0000000001",
  "esDeveloperName": "Inline_Agent_ES",
  "placeholder": "Ask about this product",
  "persistSession": true
}
```

Finding `scrt2Url`, `orgId`, and `esDeveloperName` — same path as the Cimulate shopper-agent: **Setup > Service > Embedded Service > Embedded Service Deployments > Install Code Snippet**.

## Setup env var on MRT and local

- **MRT** — Add an environment variable named `PUBLIC__app__commerce__embeddedAgent`. Use minified JSON, preserving spaces within string values.
- **Local** — Set `PUBLIC__app__commerce__embeddedAgent` in the storefront project's `.env` to the minified JSON string.
- **Disable** — Omit the variable or set `enabled` to `"false"`.

## PDP opener pills and placeholder

The widget reads two attributes seeded at mount time:

- `pdp-questions` — JSON-encoded string array from the SCAPI `c_pdpQuestions` custom product attribute. Rendered as tappable pills above the InputBar. See `parsePdpQuestions` for the defensive parse (bad publishes return `[]` without breaking the PDP). Populate via Commerce Content Studio.
- `product-name` — The product's `name`, used to template the InputBar placeholder as `Ask me anything about <productName>`.

Both attributes are kept in sync on variant switches / SPA PDP nav without re-creating the widget — tearing down would drop the SCRT2 session.

## UMD hosting

Use `cc_embeddedWidgetCdnVersion` to select a published release. It defaults to `"0.1.0"`; set this field to another published version to switch releases.
The storefront constructs `https://cdn.search.cimulate.ai/inline-agent-widget/<version>/inline-agent-widget.umd.js`.
Leave `embeddedWidgetSourceUrl` empty unless an explicit trusted URL override is required.
The URL version segment uses the same semantic-version validation as the version field.
A valid nonempty override wins over the version; clear the override when switching back to version selection.
Invalid URLs use the selected version. Missing or invalid version values use `0.1.0`.
The version field accepts semantic versions, not `latest`. The selected release must already be published;
a missing CDN file does not silently switch the shopper to another release.

These fields select the embedded widget release. The floating Cimulate Widget's `cc_cdnVersion` and the
SCRT2 capabilities version are configured separately.

Set these fields inside `PUBLIC__app__commerce__embeddedAgent`. Leave `embeddedWidgetSourceUrl` absent or empty
for version selection to take effect. The CSP contributor derives the origin from the loader's resolved URL.
Updating this environment variable triggers an MRT configuration redeploy; no UMD upload is required.

## Security

The URL override accepts only HTTPS inline-widget paths on `cdn.search.cimulate.ai`, without credentials, query strings, or fragments. CSP origins are contributed dynamically via `src/middlewares/csp-contributors/embedded-agent.ts` — the CDN URL contributes `script-src` + `connect-src` origins, `scrt2Url` contributes `connect-src` + `frame-src`.


## Verify the selected CDN release

The default release, `0.1.0`, has SHA-256 `6524a298af02eec7d1b35d69c00c01d04c96bd0824a53e1cef47cea1e612c0f5`. This checksum is for manual verification only; the loader does not enforce Subresource Integrity (SRI). HTTPS and URL validation restrict the source, but do not verify its bytes. SRI would require a trusted integrity hash for each selected release or URL. Verify the actual script URL in the browser Network tab after changing versions. Widget releases are selected through configuration; no UMD needs to be copied into this repository.

After changing the release, reload any already-open storefront tabs. Custom-element registration persists for the life of the page.

Migration: `scriptSourceUrl` is no longer read. Replace it with `cc_embeddedWidgetCdnVersion` (recommended) or move its valid CDN URL to `embeddedWidgetSourceUrl` before deploying this loader. Without the new fields, the loader selects the default release `0.1.0`.
