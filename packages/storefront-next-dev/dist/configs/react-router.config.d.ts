import { Preset } from "@react-router/dev/config";

//#region src/configs/react-router.config.d.ts

/**
 * Storefront Next preset for React Router configuration.
 * This preset enforces standard configuration for SFCC Storefront Next applications.
 * Most pinned values (`serverModuleFormat`, `ssr`, the `v8` future flags, `basename`, and — in
 * workspace environments — `allowedActionOrigins`) cannot be overridden: they are validated and an
 * error is thrown if modified. `routeDiscovery.mode` is the one exception — it defaults to
 * `'initial'` but may be overridden (e.g. to `'lazy'`); overriding it emits a warning rather than
 * throwing, so customers can opt into other modes at their own risk.
 *
 * Environment variables:
 * - `SFW_FALCON_INSTANCE` — (Optional) The Falcon instance identifier (e.g., `aws-dev2-uswest2`).
 *   When set together with `SFW_FUNCTIONAL_DOMAIN`, adds workspace proxy domains to
 *   `allowedActionOrigins` for CSRF protection on form actions.
 * - `SFW_FUNCTIONAL_DOMAIN` — (Optional) The functional domain name (e.g., `cvw-dataplane-test`).
 *   Required alongside `SFW_FALCON_INSTANCE` to construct workspace origin patterns.
 */
declare function storefrontNextPreset(): Preset;
//#endregion
export { storefrontNextPreset };
//# sourceMappingURL=react-router.config.d.ts.map