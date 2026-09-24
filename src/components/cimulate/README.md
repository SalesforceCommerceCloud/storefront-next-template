# Cimulate (Commerce Client Messaging)

Integrates the **Commerce Client** messaging widget (powered by Cimulate) as an alternative agent provider to the existing Salesforce Embedded Messaging (MIAW). The widget chunk is deferred via `requestIdleCallback` so it does not block hydration.

## Prerequisites

See [B2C Shopper Agent Setup](https://help.salesforce.com/s/articleView?id=cc.b2c_shopper_agent_setup_intro.htm&type=5) for the full setup overview. In summary:

1. **[Required Licenses for the B2C Shopper Agent](https://help.salesforce.com/s/articleView?id=cc.b2c_shopping_agent_licences.htm&language=en_US&type=5)** — Ensure your org has the required licenses provisioned for the B2C Shopper Agent.
2. **[Enable Agentic Commerce Search for the Shopper Agent](https://help.salesforce.com/s/articleView?id=cc.b2c_agentic_comm_search_enable.htm&language=en_US&type=5)** — Enable Agentic Commerce Search so the Shopper Agent can return relevant product results.
3. **[Create a B2C Shopper Agent Using the Automated Setup](https://help.salesforce.com/s/articleView?id=cc.b2c_shopper_agent_run_auto_setup.htm&type=5)** — Run the automated setup to provision and configure the B2C Shopper Agent on your Salesforce org. This includes setting up the Embedded Service deployment, obtaining the org ID, SCRT2 URL, and ES developer name, which are then supplied via the configuration below.

## Configure (Cimulate) Shopper Agent for Storefront

Set one environment variable with the full config as a JSON string:

**Preferred:** `PUBLIC__app__commerce__shopperAgent` — populates `config.commerce.shopperAgent`.

**Legacy (deprecated):** `PUBLIC__app__cimulateAgent` — kept for backward compatibility. When both are set, `commerce.shopperAgent` wins and `cimulateAgent` is ignored.

Cimulate Agent is an internal name for today's implementation of the Shopper Agent capability. The `shopperAgent` naming and the `provider` field leave room for other agent implementations in the future.

**Value:** Minified JSON object with keys: `enabled`, `provider` (currently `"commerce-client"`), `commerceClientScriptSourceUrl`, `scrt2Url`, `salesforceOrgId`, `esDeveloperName`.

Optional keys: `headerText`, `disclaimerMarkdown`, `commerceClientDisplayMode` (`panel`/`dialog`/`modal`), `commerceClientPanelWidth`, `commerceClientMode`, `commerceClientLogoUrl`, `commerceClientSearchConfig`, `commerceClientTheme`, `routingAttributes`, `isDevelopment`, `disabledPathPatterns` (see [Hiding the agent on specific pages](#hiding-the-agent-on-specific-pages)).

### Example

```json
{
  "enabled": "true",
  "provider": "commerce-client",
  "commerceClientScriptSourceUrl": "https://cdn.search.cimulate.ai/copilot-widget/1.36.0/messaging.umd.js",
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

### Finding `esDeveloperName`, `scrt2Url`, and `salesforceOrgId`

In your Salesforce org, go to **Setup > Service > Embedded Service > Embedded Service Deployments**, open the deployment for the agent created in [prerequisite 3](#prerequisites), and click **Install Code Snippet**. In the Custom Developer Code Snippet, copy the value of:

- `DeveloperName` → use as `esDeveloperName`
- `Url` → use as `scrt2Url`
- `OrganizationId` → use as `salesforceOrgId`

in the JSON value for `PUBLIC__app__commerce__shopperAgent` (or the legacy `PUBLIC__app__cimulateAgent`).

## Setup env var on Managed Runtime (MRT) and Local

**Managed Runtime (MRT)** — Add an MRT Environment Variable named `PUBLIC__app__commerce__shopperAgent` (preferred) or `PUBLIC__app__cimulateAgent` (legacy). Strip all whitespace from the JSON (minified) and set that as the variable's value. When both are set, `commerce.shopperAgent` wins and `cimulateAgent` is ignored.

**Local development** — In the root directory of the storefront, find the `.env` file. Set `PUBLIC__app__commerce__shopperAgent` (or the legacy `PUBLIC__app__cimulateAgent`) to the minified JSON string.

**Disable** — Omit the variable or set `enabled` to `"false"`.

## Hiding the agent on specific pages

Add `disabledPathPatterns` to the shopper-agent JSON to hide the widget on selected routes. Each entry is a JavaScript regex. On every navigation the code takes the current URL's path (e.g. `/global/en-GB/category/gift-certificates` — the part after the domain, before the query string) and asks each regex "do you match anywhere in this path?" — if any regex says yes, `<CimulateAgent>` does not render on that page, and a CSS rule hides the vendor widget in case its DOM was already injected on a prior navigation. No code change is required to opt pages in or out.

### Example — hide on the Gift Certificates category

```json
{
  "enabled": "true",
  "provider": "commerce-client",
  "commerceClientScriptSourceUrl": "https://cdn.search.cimulate.ai/copilot-widget/1.36.0/messaging.umd.js",
  "scrt2Url": "https://your-org.salesforce-scrt.com",
  "salesforceOrgId": "00Dxx0000000001",
  "esDeveloperName": "My_Embedded_Service",
  "disabledPathPatterns": ["/category/gift-certificates(/|$)"]
}
```

Given the app runs paths like `/global/en-GB/category/gift-certificates`, the pattern above matches that exact page and any subpath under it (e.g. `/category/gift-certificates/details`), but not lookalikes such as `/category/gift-certificates-holiday`. `(/|$)` is a regex group meaning "followed by a slash, or end of string" — it anchors the match at a path-segment boundary.

To disable multiple pages, add more patterns:

```json
"disabledPathPatterns": [
  "/category/gift-certificates(/|$)",
  "/checkout(/|$)",
  "/account/passkeys$"
]
```

## Usage

- **Root layout** — `<CimulateAgent />` mounts when the resolved shopper-agent config's `enabled` is truthy. The resolver `resolveShopperAgentConfig(appConfig)` from `@/components/cimulate` returns `config.commerce.shopperAgent` when populated, else the legacy `config.cimulateAgent`. No extra wiring needed.
- **Open widget programmatically** — `openCimulateWidget()`, provider-aware `openAgentWidget()`, or `openAgentWidgetAndSendMessage()` from `@/components/cimulate`.

## Security

The script URL is validated against trusted domains (`*.cimulate.ai`, `*.sfcc-store-internal.net`). CSP origins are contributed dynamically via `src/middlewares/csp-contributors/cimulate.ts`.

## Deprecation of Existing Shopper Agent

This component is intended to replace `src/components/shopper-agent/` (MIAW). Once Cimulate integration is verified in production, the old shopper-agent folder can be deleted.
