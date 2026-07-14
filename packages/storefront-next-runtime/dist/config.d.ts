import { n as Site, r as Url, t as Locale } from "./types.js";
import { n as DefineConfigOptions, r as defineConfig, t as BaseConfig } from "./schema.js";
import { n as defaultSecurityHeaders } from "./defaults.js";
import { ReactNode } from "react";
import * as react_jsx_runtime0 from "react/jsx-runtime";
import * as react_router5 from "react-router";
import { RouterContextProvider } from "react-router";

//#region src/config/context.d.ts

/**
 * Augmentation hook for typing `getConfig()` / `useConfig()` /
 * `appConfigContext`. Templates augment once via `declare module` so call
 * sites don't need a per-call generic. Without augmentation, property
 * accesses type to `unknown`. See README-CONFIG.md for the augmentation
 * snippet and the multi-template caveat.
 */
interface AppConfigShape {
  [key: string]: unknown;
}
/**
 * Augmentation hook for the client-facing narrowed return type — used by
 * `useConfig()` and `getConfig()`'s no-arg + maybe-context overloads. When
 * templates fill this (typically with `Omit<AppConfig, 'serverExtension'>`),
 * those reads return the narrowed shape and `.serverExtension` becomes a
 * TypeScript error in client code. The server `getConfig(context)` overload is
 * unaffected. Empty by default — un-augmented customers fall back to
 * `AppConfigShape`, so the upgrade is zero-breakage. See README-CONFIG.md.
 *
 * Defined as a separate slot rather than `Omit<AppConfigShape, KeySet>` because
 * the latter doesn't compose with `AppConfigShape`'s `[key: string]: unknown`
 * index signature: `Omit` over an index-signatured interface produces a mapped
 * type that subsumes the augmented members.
 *
 * Caveat for templates: keep your `AppConfig` itself **index-signature-free at
 * the top level**. If your template's `AppConfig` carries a `[key: string]:
 * unknown`, then `Omit<AppConfig, 'serverExtension'>` keeps that signature,
 * which makes `serverExtension` resolve to `unknown` at the call site
 * (accessible, not removed) and silently defeats the narrow. The retail
 * template's `AppConfig` (`src/types/config.ts`) demonstrates the
 * index-signature-free shape.
 */
interface ClientFacingAppConfigShape {}
/**
 * Router context for application configuration. Populated by the template's
 * app-config middleware; read via `context.get(appConfigContext)` in loaders,
 * actions, and other middleware. Returns the augmented `AppConfigShape`.
 */
declare const appConfigContext: react_router5.RouterContext<AppConfigShape>;
/**
 * Router context for the **client-safe view** of the application configuration —
 * `appConfigContext` minus any server-only namespaces (which namespaces are server-only
 * is template-defined; the SDK only owns the slot). The template's app-config middleware
 * populates this with a precomputed view (the strip is identical on every request, so
 * computing it per-request allocates a fresh object every render for no behavioral
 * difference); the root loader reads from this context for the value it returns to React
 * Router, which then ships in the SSR hydration payload. Reading the unstripped
 * `appConfigContext` for the loader return would leak server-only namespaces into the
 * browser via that channel.
 *
 * Type is `Partial<AppConfigShape>` because the client view is always a subset of the
 * full shape. For a stronger narrow at the read site, augment `ClientFacingAppConfigShape`
 * (the same slot that narrows `useConfig()`) and cast through `ClientFacingAppConfig`.
 */
declare const clientAppConfigContext: react_router5.RouterContext<Partial<AppConfigShape>>;
interface ConfigProviderProps {
  config: AppConfigShape;
  children: ReactNode;
}
/**
 * React context provider for application configuration.
 *
 * Wrap your component tree with this to enable `useConfig()` in child components.
 * Typically placed in the root layout component.
 */
declare function ConfigProvider({
  config,
  children
}: ConfigProviderProps): react_jsx_runtime0.JSX.Element;
//#endregion
//#region src/config/get-config.d.ts
/**
 * Default return type for the client-facing reads — `useConfig()` and
 * `getConfig()`'s no-arg + maybe-context overloads. Resolves to the template's
 * `ClientFacingAppConfigShape` augmentation (typically `Omit<AppConfig, 'serverExtension'>`)
 * when present, and falls back to `AppConfigShape` otherwise — the fallback is
 * what keeps the upgrade zero-breakage for un-augmented customers.
 *
 * The conditional shape is load-bearing — do not rewrite as
 * `AppConfigShape & ClientFacingAppConfigShape`. An intersection re-introduces every
 * member from the wider `AppConfigShape` augmentation, which silently disables the
 * narrow.
 */
type ClientFacingAppConfig = keyof ClientFacingAppConfigShape extends never ? AppConfigShape : ClientFacingAppConfigShape;
declare global {
  interface Window {
    __APP_CONFIG__?: Record<string, unknown>;
  }
}
/**
 * Get configuration in loaders, actions, and utilities. Pass `context` on the
 * server; omit it on the client (reads `window.__APP_CONFIG__`).
 *
 * - `getConfig(context)` (server) returns the full `AppConfigShape` —
 *   `.serverExtension` is reachable.
 * - `getConfig()` (client, no-arg) and `getConfig(ctx | undefined)` (the
 *   wrapper form) return the narrowed `ClientFacingAppConfig` — reading
 *   `.serverExtension` is a TypeScript error. The runtime value is `undefined`
 *   on the client anyway (the extractor strips it before `window.__APP_CONFIG__`);
 *   the narrow surfaces that at edit time.
 *
 * Server helpers needing the full shape from a maybe-context call should
 * narrow first (`if (ctx) getConfig(ctx)`) or pass `getConfig<AppConfig>(ctx)`.
 */
declare function getConfig<T extends Record<string, unknown> = AppConfigShape>(context: Readonly<RouterContextProvider>): T;
declare function getConfig<T extends Record<string, unknown> = ClientFacingAppConfig>(): T;
declare function getConfig<T extends Record<string, unknown> = ClientFacingAppConfig>(context: Readonly<RouterContextProvider> | undefined): T;
/**
 * Get configuration in React components (use this instead of `getConfig` —
 * React Context requires `useContext`). Returns `ClientFacingAppConfig`, which
 * is the template's `ClientFacingAppConfigShape` augmentation (typically
 * `Omit<AppConfig, 'serverExtension'>`) when present, and falls back to the full
 * `AppConfigShape` otherwise. The fallback keeps the upgrade zero-breakage.
 */
declare function useConfig<T extends Record<string, unknown> = ClientFacingAppConfig>(): T;
//#endregion
export { type AppConfigShape, type BaseConfig, type ClientFacingAppConfig, type ClientFacingAppConfigShape, ConfigProvider, type DefineConfigOptions, type Locale, type Site, type Url, appConfigContext, clientAppConfigContext, defaultSecurityHeaders, defineConfig, getConfig, useConfig };
//# sourceMappingURL=config.d.ts.map