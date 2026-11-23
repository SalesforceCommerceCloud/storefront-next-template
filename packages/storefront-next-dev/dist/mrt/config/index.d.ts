//#region src/types.d.ts

/**
 * Managed Runtime SSR Configuration
 * Defines which files are server-only vs shared between server and client
 */
interface MrtSsrConfig {
  /** Files that should only be deployed to SSR functions (server-side only) */
  ssrOnly: string[];
  /** Files that should be shared between SSR and client (static assets, client bundles) */
  ssrShared: string[];
  /** SSR function parameters (e.g., Node.js version) */
  ssrParameters: {
    ssrFunctionNodeVersion: string;
    [key: string]: string | number | boolean;
  };
}
//#endregion
//#region src/config.d.ts

/**
 * Build MRT SSR configuration for bundle deployment
 *
 * Defines which files should be:
 * - Server-only (ssrOnly): Deployed only to Lambda functions
 * - Shared (ssrShared): Deployed to both Lambda and CDN
 *
 * @param buildDirectory - Path to the build output directory
 * @param projectDirectory - Path to the project root (reserved for future use)
 * @returns MRT SSR configuration with glob patterns
 */
type RuntimeConfig = {
  runtime?: {
    ssrOnly?: string[];
    ssrShared?: string[];
    ssrParameters?: Record<string, string | number | boolean>;
  };
};
/**
 * Load runtime config from config.server.ts for MRT bundle settings.
 *
 * Keep in sync with @salesforce/storefront-next-runtime/src/config/load-config.ts.
 */

/**
 * Build the MRT SSR configuration from the `runtime` section of `config.server.ts`.
 *
 * Patterns from `runtime` are merged with the defaults rather than replacing them. Pure and
 * synchronous so build tooling that already has the runtime config loaded can reuse the defaults.
 *
 * @param runtime - The `runtime` section of `config.server.ts`, if any
 * @param mode - Build mode; `production` selects the streaming entry point unless `MRT_BUNDLE_TYPE=ssr`
 */
declare const buildMrtSsrConfig: (runtime?: RuntimeConfig["runtime"], mode?: string) => MrtSsrConfig;
//#endregion
export { type MrtSsrConfig, buildMrtSsrConfig };
//# sourceMappingURL=index.d.ts.map