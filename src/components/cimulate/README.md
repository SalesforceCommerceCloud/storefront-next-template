# Cimulate (Commerce Client Messaging)

Integrates the **Commerce Client** messaging widget (powered by Cimulate) as an alternative agent provider to the existing Salesforce Embedded Messaging (MIAW). The widget chunk is deferred via `requestIdleCallback` so it does not block hydration.

## Configuration

Set one environment variable with the full config as a JSON string:

**Variable:** `PUBLIC__app__cimulateAgent`

**Value:** Minified JSON object with keys: `enabled`, `provider` (must be `"commerce-client"`), `commerceClientScriptSourceUrl`, `scrt2Url`, `salesforceOrgId`, `esDeveloperName`.

Optional keys: `headerText`, `disclaimerMarkdown`, `commerceClientDisplayMode` (`panel`/`dialog`/`modal`), `commerceClientPanelWidth`, `commerceClientMode`, `commerceClientLogoUrl`, `commerceClientSearchConfig`, `commerceClientTheme`, `routingAttributes`, `isDevelopment`.

### Example

```json
{
    "enabled": "true",
    "provider": "commerce-client",
    "commerceClientScriptSourceUrl": "https://cdn.search.cimulate.ai/copilot-widget/1.9.0/messaging.umd.js",
    "scrt2Url": "https://your-org.salesforce-scrt.com",
    "salesforceOrgId": "00Dxx0000000001",
    "esDeveloperName": "My_Embedded_Service",
    "headerText": "Commerce Assistant",
    "disclaimerMarkdown": "This is AI and can make mistakes.",
    "commerceClientDisplayMode": "panel",
    "commerceClientPanelWidth": "420px",
    "commerceClientMode": "messaging",
    "commerceClientLogoUrl": "https://cimulate.ai/logo.png"
}
```

## Setup

1. **Local / .env** — Set `PUBLIC__app__cimulateAgent` to the minified JSON string.
2. **Managed Runtime (MRT)** — Add `PUBLIC__app__cimulateAgent` in Environment Variables.
3. **Disable** — Omit the variable or set `enabled` to `"false"`.

## Usage

- **Root layout** — `<CimulateAgent />` mounts when `appConfig.cimulateAgent?.enabled` is truthy. No extra wiring needed.
- **Open widget programmatically** — `openCimulateWidget()` or provider-aware `openAgentWidget()` from `@/components/cimulate`.

## Security

The script URL is validated against trusted domains (`*.cimulate.ai`, `*.sfcc-store-internal.net`). CSP origins are contributed dynamically via `src/middlewares/csp-contributors/cimulate.ts`.

## Deprecation of Existing Shopper Agent

This component is intended to replace `src/components/shopper-agent/` (MIAW). Once Cimulate integration is verified in production, the old shopper-agent folder can be deleted.
