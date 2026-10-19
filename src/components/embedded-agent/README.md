# Embedded Agent (Inline PDP `<inline-agent-widget>`)

Mounts the inline PDP agent widget — a Lightning Web Component shipped as a UMD bundle (`inline-agent-widget.umd.js`) that registers the `<inline-agent-widget>` custom element. Unlike the floating [Cimulate shopper-agent](../cimulate/README.md), this widget renders inline on the PDP and seeds opener-question pills + a product-grounded InputBar placeholder from SCAPI product data.

## Configure

Set one environment variable with the full config as a JSON string:

`PUBLIC__app__commerce__embeddedAgent`

### Required keys

- `enabled` — `"true"` to render the widget.
- `scrt2Url` — Core-Agent SCRT2 endpoint from the Embedded Service Deployment.
- `orgId` — Salesforce 18-char org ID.
- `esDeveloperName` — Developer name of the Embedded Service Deployment.

### Optional keys

- `placeholder` — Overrides the InputBar placeholder when no `productName` is seeded.
- `persistSession` — Pass `false` to disable session persistence. Default `true`.
- `enableLogging` — Pass `true` to enable widget-side console logging.
- `scriptSourceUrl` — HTTPS URL for the UMD bundle. Must resolve to a trusted host (`*.cimulate.ai`, `*.sfcc-store-internal.net`). When omitted the self-hosted `/inline-agent-widget.umd.js` under `public/` is used.
- `capabilitiesVersion` — Capability-matrix version. Defaults to `66`.

### Example

```json
{
  "enabled": "true",
  "scrt2Url": "https://your-org.salesforce-scrt.com",
  "orgId": "00Dxx0000000001",
  "esDeveloperName": "Inline_Agent_ES",
  "placeholder": "Ask about this product",
  "persistSession": true
}
```

Finding `scrt2Url`, `orgId`, and `esDeveloperName` — same path as the Cimulate shopper-agent: **Setup > Service > Embedded Service > Embedded Service Deployments > Install Code Snippet**.

## Setup env var on MRT and local

- **MRT** — Add an environment variable named `PUBLIC__app__commerce__embeddedAgent`. Strip all whitespace from the JSON (minified) and set that as the value.
- **Local** — Set `PUBLIC__app__commerce__embeddedAgent` in the root `.env` to the minified JSON string.
- **Disable** — Omit the variable or set `enabled` to `"false"`.

## PDP opener pills and placeholder

The widget reads two attributes seeded at mount time:

- `pdp-questions` — JSON-encoded string array from the SCAPI `c_pdpQuestions` custom product attribute. Rendered as tappable pills above the InputBar. See `parsePdpQuestions` for the defensive parse (bad publishes return `[]` without breaking the PDP). Populate via Commerce Content Studio.
- `product-name` — The product's `name`, used to template the InputBar placeholder as `Ask me anything about <productName>`.

Both attributes are kept in sync on variant switches / SPA PDP nav without re-creating the widget — tearing down would drop the SCRT2 session.

## UMD hosting

v1 self-hosts `inline-agent-widget.umd.js` under `packages/template/public/`. CDN hosting (via the Cimulate CDN at `cdn.search.cimulate.ai`) is tracked under the inline-agent-widget CDN publish plan (Path B). Once live, flip to CDN by setting `scriptSourceUrl` in the config JSON — the trust-list check accepts `*.cimulate.ai`.

## Security

The script URL is validated against trusted domains (`*.cimulate.ai`, `*.sfcc-store-internal.net`). CSP origins are contributed dynamically via `src/middlewares/csp-contributors/embedded-agent.ts` — same-origin self-host contributes nothing (covered by `self`), CDN URL contributes `script-src` + `connect-src` origins, `scrt2Url` contributes `connect-src` + `frame-src`.
