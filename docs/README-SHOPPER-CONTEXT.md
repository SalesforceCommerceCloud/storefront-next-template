# Shopper Context

Shopper Context enables personalized commerce experiences by associating session-level attributes — such as source codes, customer groups, custom qualifiers, and assignment qualifiers — with a shopper's session. These attributes influence pricing, promotions, product sorting, and other backend behaviors without requiring changes to individual API calls.

This integration wraps the [Shopper Context API](https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-context?meta=Summary) and manages qualifier state through server middleware, cookies, and a React hook.

## Feature Flag

Shopper Context is **disabled by default**. Enable it via environment variable or config:

```bash
PUBLIC__app__features__shopperContext__enabled=true
```

When disabled, ordinary requests make no native Shopper Context calls. Explicit store-selection cleanup is the exception; see [store selection](./README-STORE-SELECTION.md#disable-and-drain).

## How It Works

Qualifiers enter the system through two paths:

1. **URL query parameters** — A server middleware extracts qualifiers from the URL on every request (e.g., `?src=spring-sale&deviceType=mobile`)
2. **React hook** — The `useShopperContext` hook lets components update qualifiers from UI interactions (e.g., store selector, coupon input)

Both paths PATCH only the supplied qualifiers, preserving unrelated native values even when their cookies are absent. Cookies retain a replica of the supplied qualifier state. A specific native missing-context fault permits creation; other native failures propagate.

Store selection uses the [validated selection action](./README-STORE-SELECTION.md), which coordinates native store qualification and the selected-store cookie. Configured store-owned keys cannot be changed through generic URL or hook controls.

## Qualifier Support

The template supports the following qualifiers from the [Shopper Context API](https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-context?meta=type%3AShopperContext) out of the box:

| API Field | URL Parameter | Notes |
|-----------|---------------|-------|
| `sourceCode` | `src` | Campaign/source code for attribution and promotion targeting |
| `couponCodes` | `couponCodes` | Comma-separated list of coupon codes |
| `customQualifiers` | `deviceType` | e.g., `?deviceType=mobile` |
| `assignmentQualifiers` | `store` | Store-owned keys use the validated selection action |

`effectiveDateTime`, `customerGroupIds`, `clientIp`, and `geoLocation` are not enabled by default. To enable them, update `SHOPPER_CONTEXT_SEARCH_PARAMS` in `src/lib/shopper-context/constants.ts`. Make sure the qualifier is supported by the API — see the [ShopperContext type reference](https://developer.salesforce.com/docs/commerce/commerce-api/references/shopper-context?meta=type%3AShopperContext). `geoLocation` is a structured object and may require additional handling.

To add a validation layer on commerce API requests, consider the [Shopper Context Hooks](https://github.com/SalesforceCommerceCloud/shopper_context_hooks) cartridge. It intercepts calls to create/update context and validates the body against a predefined scope for a given client ID.

## Cookies

Generic qualifier controls use two `httpOnly` replica cookies. They do not authorize replacing native context. Store selection has its own reconciliation and provenance cookies; see [the selection contract](./README-STORE-SELECTION.md#selection-contract).

| Cookie | Base Name | Default Expiry | Format | Purpose |
|--------|-----------|---------------|--------|---------|
| Shopper Context | `storefront-next-context` | 6 hours | JSON object | All qualifiers except source code |
| Source Code | `dwsourcecode` | 30 days | Bare string | Source code qualifier |

The `dwsourcecode_*` cookie stores the bare source-code string (e.g. `email`) rather than a JSON object so SFRA storefronts running side-by-side can read the same cookie name and value format directly.

When new qualifiers are supplied, the middleware patches those native keys and updates their cookie replicas after success. Unmentioned native qualifiers remain unchanged.

## Customization

To add a new qualifier, edit `SHOPPER_CONTEXT_SEARCH_PARAMS` in `src/lib/shopper-context/constants.ts`. Once added, it is automatically supported in both URL query parameters and the `useShopperContext` hook.

To update qualifiers programmatically from a component, use the `useShopperContext` hook. It accepts the same qualifier keys used in URL parameters and updates SCAPI and cookies without a full page navigation.

```typescript
import { useShopperContext } from '@/hooks/use-shopper-context';

function CouponSelector() {
    const { updateQualifiers, isLoading, error, success } = useShopperContext();

    const handleCouponChange = (couponCode: string) => {
        updateQualifiers({ couponCodes: couponCode });
    };

    return (
        <select onChange={(e) => handleCouponChange(e.target.value)} disabled={isLoading}>
            <option value="SAVE10">SAVE10</option>
            <option value="WELCOME">WELCOME</option>
        </select>
    );
}
```

## Expiry

- **Browser cookies** — Cleared automatically on logout or auth failure. The shopper context cookie expires after 6 hours and the source code cookie after 30 days. Cookie expiry values are defined in `src/lib/shopper-context/constants.ts`.
- **API-side context** — Scoped to the USID. Generic qualifier updates recreate missing context when new values are supplied. Enabled store selection reconciles native state before dependent commerce reads, repairs valid remembered selections and delegates nonempty-basket recovery when native lineage is missing; see [store selection](./README-STORE-SELECTION.md).
