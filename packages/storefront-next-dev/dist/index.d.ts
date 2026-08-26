import { Project } from "ts-morph";
import { Plugin, ResolvedConfig } from "vite";

//#region src/plugins/pageDesignerPreloadManifest.d.ts

interface PageDesignerPreloadCompressionConfig {
  brotli?: {
    quality?: number;
  };
  gzip?: {
    level?: number;
  };
}
interface PageDesignerPreloadManifestConfig {
  path?: string;
  requiredTypeIds?: string[];
  compression?: PageDesignerPreloadCompressionConfig;
}
//#endregion
//#region src/plugins/staticRegistry.d.ts

/**
 * Configuration options for the static registry plugin
 */
interface StaticRegistryPluginConfig {
  /**
   * Path to the components directory to scan
   * @default 'src/components'
   */
  componentPath?: string;
  /**
   * Path to the registry file to update
   * Note: The registry file must contain STATIC_REGISTRY_START and STATIC_REGISTRY_END markers
   * and must export a 'registry' variable (or use registryIdentifier to specify a different name)
   * @default 'src/lib/registry.ts'
   */
  registryPath?: string;
  /**
   * Name of the registry variable to use in generated code
   * @default 'registry'
   */
  registryIdentifier?: string;
  /**
   * Whether to fail the build on registry generation errors
   * @default true
   */
  failOnError?: boolean;
  /**
   * Emit and embed a compact Page Designer component preload manifest.
   * Disabled by default.
   */
  preloadManifest?: boolean | PageDesignerPreloadManifestConfig;
}
//#endregion
//#region src/plugins/eventInstrumentationValidator.d.ts

/**
 * Configuration options for the event instrumentation validator plugin
 */
interface EventInstrumentationValidatorConfig {
  /**
   * Path to config module relative to project root
   * @default 'config.server.ts'
   */
  configPath?: string;
  /**
   * Directories to scan for trackEvent calls relative to project root
   * @default ['src']
   */
  scanPaths?: string[];
  /**
   * Whether to fail the build on missing instrumentation
   * @default false (warning only)
   */
  failOnMissing?: boolean;
}
//#endregion
//#region src/storefront-next-targets.d.ts

/**
 * Configuration options for the Storefront Next Vite plugin.
 */
interface StorefrontNextTargetsConfig {
  /**
   * Enable human-readable chunk file names for easier debugging in production builds.
   * When enabled, chunk files will be named based on their source location
   * rather than just the file name and random hashes.
   *
   * This is useful to identify the chunk files and is usually used in development,
   * in conjunction with the bundle analyzer.
   *
   * Example:
   *
   * ```
   * (package)-(pkg-name)-index.[hash].js
   * (components)-(ui)-(inputs)-(TextField)-index.[hash].js
   * ```
   *
   * Instead of:
   *
   * ```
   * index.[hash].js
   * ```
   *
   * @default false
   */
  readableChunkNames?: boolean;
  /**
   * Configuration for the static registry plugin that automatically generates
   * component registrations based on @Component decorators.
   *
   * Set to `false` to disable the static registry plugin entirely.
   *
   * @default { componentPath: 'src/components', registryPath: 'src/lib/registry.ts' }
   */
  staticRegistry?: StaticRegistryPluginConfig;
  /**
   * Configuration for the event instrumentation validator plugin that validates
   * all enabled analytics event toggles have corresponding trackEvent() calls.
   *
   * Set to `false` to disable the validator entirely.
   *
   * @default { configPath: 'config.server.ts', scanPaths: ['src'], failOnMissing: false }
   */
  eventInstrumentationValidator?: EventInstrumentationValidatorConfig | false;
}
/**
 * Storefront Next Vite plugin that powers the React Router app.
 * Supports building and optimizing for the managed runtime environment.
 *
 * @param config - Configuration options for the plugin
 * @returns {Plugin[]} An array of Vite plugins for Storefront Next functionality
 *
 * @example
 * // With default options
 * export default defineConfig({
 *   plugins: [storefrontNextTargets()]
 * })
 *
 * @example
 * // Disable readable chunk names
 * export default defineConfig({
 *   plugins: [storefrontNextTargets({ readableChunkNames: false })]
 * })
 */
declare function storefrontNextTargets(config?: StorefrontNextTargetsConfig): Plugin[];
//#endregion
//#region src/plugins/transformTargets.d.ts
declare function transformTargetPlaceholderPlugin(): {
  name: string;
  enforce: "pre";
  configResolved(config: ResolvedConfig): void;
  buildStart(): void;
  transform(code: string, id: string): {
    code: string;
    map: null;
  } | null;
};
//#endregion
//#region src/plugins/uiTargetDevMode.d.ts
/**
 * @deprecated This plugin has been removed. It was an internal-only debugging aid
 * that could cause build failures when extensions were trimmed. The export is kept
 * as a no-op for backward compatibility and will be removed in v2.
 *
 * **Migration:** Remove any `uiTargetDevMode()` plugin from your `vite.config.ts`,
 * delete `vite-plugins/ui-target-dev-mode.ts` if it exists, and remove the plugin
 * from the Vite plugins array.
 */
interface UITargetDevModeConfig {
  /**
   * @deprecated No longer used
   */
  enabled?: boolean;
  /**
   * @deprecated No longer used
   */
  filterCategory?: string;
  /**
   * @deprecated No longer used
   */
  hintMap?: Record<string, string>;
}
/**
 * @deprecated This plugin has been removed. It was an internal-only debugging aid
 * that could cause build failures when extensions were trimmed. The export is kept
 * as a no-op for backward compatibility and will be removed in v2.
 *
 * **Migration:** Remove any `uiTargetDevMode()` plugin from your `vite.config.ts`,
 * delete `vite-plugins/ui-target-dev-mode.ts` if it exists, and remove the plugin
 * from the Vite plugins array.
 *
 * @returns A no-op Vite plugin
 */
declare function uiTargetDevModePlugin(_config?: UITargetDevModeConfig): Plugin;
//#endregion
//#region src/plugins/hybridProxy.d.ts

interface HybridProxyPluginOptions {
  /** Whether hybrid proxying is enabled */
  enabled: boolean;
  /** SFCC origin URL to proxy non-matching routes to */
  targetOrigin: string;
  /** Cloudflare routing expression (routes matching go to Next) */
  routingRules: string;
  /**
   * Callback that decides if a pathname should be handled by Storefront Next.
   * Called for every request that isn't a Vite internal or SFCC path.
   * Receives the pathname and the raw `routingRules` string; returns true to
   * let React Router handle it, false to proxy to SFCC.
   *
   * @example
   * import { shouldRouteToNext } from './src/lib/ecdn-matcher';
   * hybridProxyPlugin({ routeMatcher: shouldRouteToNext, ... })
   */
  routeMatcher: (pathname: string, routingRules: string) => boolean;
  /** SFCC default site ID (e.g., 'RefArchGlobal'). Required when `enabled` is true. */
  defaultSiteId?: string;
  /** Locale for SFRA paths (e.g., 'en-GB'). Defaults to 'default' if not provided. */
  locale?: string;
  /**
   * The storefront's `url.prefix` (from `config.server.ts`), e.g. `'/:siteId/:localeId'`
   * or `'/:localeId'`. When set, the proxy strips this prefix from the incoming path
   * before decorating to SFRA's `/s/{siteId}/{locale}/…` form, and reuses the
   * site/locale the path already carries instead of the `defaultSiteId`/`locale`
   * fallbacks. This is what keeps a prefixed request like `/uk/cart` from being
   * double-stacked into `/s/{siteId}/{locale}/uk/cart`.
   *
   * Prefix support is OOTB: with `url.prefix` configured, no further opt-in is needed.
   * Leave undefined (or `'/'`) for storefronts that emit bare functional paths.
   */
  urlPrefix?: string;
  /**
   * Known locale identifiers — every locale `id` AND `alias` the storefront serves
   * (e.g. `['en-GB', 'uk', 'de-DE']`). Used to confirm that a captured prefix segment
   * is really a locale before treating it as one, so a bare path like `/cart` under a
   * `/:localeId` prefix isn't mistaken for the locale `cart`. The matched value is
   * passed straight through as the SFRA locale path segment (SFRA resolves both the
   * BM site-path alias `uk` and the canonical `en-GB`).
   */
  localeAliases?: string[];
  /**
   * Known site identifiers — every site `id` AND `alias` the storefront serves
   * (e.g. `['RefArchGlobal', 'global']`). Same role as {@link localeAliases} for the
   * `:siteId` segment of a `/:siteId/:localeId`-style prefix.
   */
  siteAliases?: string[];
  /**
   * Last-resort escape hatch: fully override how an incoming proxy path is rewritten
   * to the SFRA path. Receives the bare pathname (no query) and returns the SFRA path
   * (no query — the proxy re-appends the original query string). Return `null` to fall
   * back to the built-in OOTB rewrite.
   *
   * Prefer leaving this undefined: with `urlPrefix` set the built-in rewrite already
   * handles all standard prefix shapes. Use this only for a non-standard URL model the
   * prefix machinery can't express.
   */
  rewritePath?: (pathname: string) => string | null;
}
/**
 * Vite plugin for hybrid proxying between Storefront Next and legacy SFRA.
 *
 * Uses http-proxy to silently forward non-matching requests to SFCC without visible
 * redirects. Rewrites Set-Cookie headers, Location headers, and HTML/JSON response
 * bodies to keep all navigation within the localhost proxy.
 *
 * Routing decisions are delegated to the `routeMatcher` callback injected via options,
 * keeping the SDK free of template-specific routing logic.
 *
 * @param options - Plugin configuration
 * @returns Vite plugin
 */
declare function hybridProxyPlugin(options: HybridProxyPluginOptions): Plugin;
//#endregion
//#region src/plugins/ecdnMatcher.d.ts

/**
 * Main function: Determines if a pathname should route to Storefront Next
 * or be proxied/redirected to SFRA/legacy backend.
 *
 * @param pathname - URL pathname (e.g., "/search", "/checkout")
 * @param routingRules - Cloudflare routing expression string (optional)
 * @returns true if should route to Storefront Next, false if should proxy to SFRA
 *
 * @example
 * ```typescript
 * const rules = '(http.request.uri.path matches "^/$" or http.request.uri.path matches "^/category.*")';
 *
 * shouldRouteToNext('/', rules);              // true - route to Next
 * shouldRouteToNext('/category/mens', rules); // true - route to Next
 * shouldRouteToNext('/checkout', rules);      // false - proxy to SFRA
 * shouldRouteToNext('/any-path', undefined);  // true - no rules = default to Next
 * ```
 */
declare function shouldRouteToNext(pathname: string, routingRules?: string): boolean;
//#endregion
export { type HybridProxyPluginOptions, type StorefrontNextTargetsConfig, type UITargetDevModeConfig, storefrontNextTargets as default, hybridProxyPlugin, shouldRouteToNext, transformTargetPlaceholderPlugin, uiTargetDevModePlugin };
//# sourceMappingURL=index.d.ts.map