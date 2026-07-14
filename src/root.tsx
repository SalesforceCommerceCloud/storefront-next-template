/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { type PropsWithChildren, useEffect, useMemo, useRef } from 'react';

// React Router
import {
    type DataStrategyResult,
    isRouteErrorResponse,
    Links,
    Meta,
    type MetaDescriptor,
    type MiddlewareFunction,
    Navigate,
    Outlet,
    Scripts,
    ScrollRestoration,
    useRevalidator,
    useRouteLoaderData,
} from 'react-router';
import type { Route } from './+types/root';
import { routes } from '@/route-paths';

// Third-party libraries
import { createInstance, type i18n } from 'i18next';
import { I18nextProvider, useTranslation, initReactI18next } from 'react-i18next';
import { PageDesignerProvider } from '@salesforce/storefront-next-runtime/design/react/core';
import { isDesignModeActive, isPreviewModeActive } from '@salesforce/storefront-next-runtime/design/mode';
import { dataStoreMiddlewareLazy } from '@salesforce/storefront-next-runtime/data-store';
import {
    buildUrl,
    SiteProvider,
    siteContext,
    type Site,
    type Locale,
} from '@salesforce/storefront-next-runtime/site-context';

// Middlewares
import authMiddlewareServer, { getAuth as getAuthServer } from '@/middlewares/auth.server';
import { getPublicSessionData } from '@/middlewares/auth.utils';
import createBasketMiddleware, { basketResourceContext, type BasketSnapshot } from '@/middlewares/basket.server';
import shopperContextMiddlewareServer from '@/middlewares/shopper-context.server';
import legacyRoutesMiddlewareClient from '@/middlewares/legacy-routes.client';
import {
    performanceMetricsMiddlewareClient,
    performanceMetricsMiddlewareServer,
} from '@/middlewares/performance-metrics';
import { appConfigMiddlewareServer } from '@/middlewares/app-config.server';
import { appConfigMiddlewareClient } from '@/middlewares/app-config.client';
import { ConfigProvider, getConfig, clientAppConfigContext } from '@salesforce/storefront-next-runtime/config';
import type { ClientAppConfig } from '@/lib/app-config-client';
import { siteContextMiddleware } from '@/middlewares/site-context.server';
import { i18nextMiddleware } from '@/middlewares/i18next.server';
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import {
    selectedStoreMiddleware,
    selectedStoreContext,
} from '@/extensions/store-locator/middlewares/selected-store.server';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
import { correlationMiddleware } from '@/middlewares/correlation.server';
import { requestOriginMiddleware } from '@/middlewares/request-origin';
import { getAppOrigin } from '@/lib/origin';
import { loggingMiddleware } from '@/middlewares/logging.server';
import { pageDesignerResolutionMiddleware } from '@/middlewares/page-designer-page-resolution.server';
import { siteUrlConfigMiddleware } from '@/middlewares/site-url-config.server';
import { modeDetectionMiddlewareServer, modeDetectionMiddlewareClient } from '@/middlewares/mode-detection';
import { maintenanceMiddleware } from '@/middlewares/maintenance.server';
import { securityHeadersMiddleware } from '@/middlewares/security-headers.server';
import { getSecurityNonce } from '@salesforce/storefront-next-runtime/security';
import { useSecurityNonceFromContext } from '@salesforce/storefront-next-runtime/security/react';
import { errorCacheControlMiddleware } from '@/middlewares/error-cache-control.server';

// Providers
import AuthProvider from '@/providers/auth';
import BasketProvider from '@/providers/basket';
import { ComposeProviders } from '@/providers/compose-providers';
import { CorrelationProvider } from '@/providers/correlation';
import { correlationContext } from '@/lib/correlation';

// Components
import { AppToaster } from '@/components/toast';
import { TrackingConsentBanner } from '@/components/tracking-consent-banner';
import CimulateAgent, { isCimulateEnabled } from '@/components/cimulate';

// Hooks
import { useExecutePendingAction } from '@/hooks/use-execute-pending-action';

// Lib/Utils
import type { PublicSessionData } from '@/lib/api/types';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { PageViewTracker } from '@/analytics/page-view-tracker';
import { initializeRegistry } from '@/lib/page-designer/static-registry';
import { buildSeoMetaDescriptors } from '@/utils/seo';

// Assets
import favicon from '/favicon.ico';

// Fonts
import { primaryFont } from '@/lib/fonts';

// Styles
import { PageDesignerInit } from '@/page-designer-init';
import appStylesHref from '@/theme/index.css?url';

// Extensions
import { UITargetProviders } from '@/targets/ui-target-providers';
// @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
import StoreLocatorProvider from '@/extensions/store-locator/providers/store-locator';
// @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
import { type Maintenance, maintenanceContext } from '@/lib/maintenance';

// Layout Components - logo for error page. Imported via `@/...` so different
// logo implementations (raster, inline-SVG, etc.) can be provided per brand.
import Logo from '@/components/logo';

export const links: Route.LinksFunction = () => {
    return [
        // Preload critical fonts
        { rel: 'preload', href: primaryFont, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
        { rel: 'preload', href: appStylesHref, as: 'style' },
        { rel: 'stylesheet', href: appStylesHref },
    ];
};

export const meta: Route.MetaFunction = ({ loaderData }) => {
    return loaderData?.seoMeta ?? [];
};

export const middleware: MiddlewareFunction<Response>[] = [
    correlationMiddleware,
    errorCacheControlMiddleware,
    requestOriginMiddleware,
    loggingMiddleware,
    modeDetectionMiddlewareServer,
    appConfigMiddlewareServer,
    securityHeadersMiddleware,
    siteContextMiddleware, // Must run after appConfig, before i18next and currency
    ...dataStoreMiddlewareLazy,
    siteUrlConfigMiddleware, // Must run after siteContextMiddleware (entry key uses site id)
    i18nextMiddleware,
    pageDesignerResolutionMiddleware,
    selectedStoreMiddleware /** @sfdc-extension-line SFDC_EXT_STORE_LOCATOR */,
    performanceMetricsMiddlewareServer,
    maintenanceMiddleware,
    authMiddlewareServer,
    createBasketMiddleware(),
    shopperContextMiddlewareServer,
];

export const clientMiddleware: MiddlewareFunction<Record<string, DataStrategyResult>>[] = [
    // Client middleware functions have varying return types, but React Router expects Record<string, DataStrategyResult>
    // We cast through unknown to avoid type errors while maintaining runtime correctness
    appConfigMiddlewareClient as unknown as MiddlewareFunction<Record<string, DataStrategyResult>>, // Must run first to set config in context
    modeDetectionMiddlewareClient,
    legacyRoutesMiddlewareClient as unknown as MiddlewareFunction<Record<string, DataStrategyResult>>, // Checks hybrid.enabled, needs config from context
    performanceMetricsMiddlewareClient as unknown as MiddlewareFunction<Record<string, DataStrategyResult>>,
];

// Client-side i18next instance. Hydration is deferred until its initial-language
// namespaces have loaded — see `entry.client.tsx` / `whenI18nReady()` — so the
// first client render matches the server-rendered translated HTML (no hydration
// mismatch) without inlining the translation bundle into the document.
import { i18nextOnClient } from '@/i18n-client-init';

export { shouldRevalidate } from '@/lib/revalidation/routes/root';

export const loader = ({
    context,
    request,
}: Route.LoaderArgs): {
    // Public auth data - only non-sensitive fields, safe to serialize
    clientAuth: PublicSessionData;
    // Client-safe view: extractClientConfig strips app.serverExtension before this loader
    // returns, since React Router serializes the loader return into the SSR hydration
    // payload and reaches the browser. Server-only reads of those values still go through
    // getConfig(context).serverExtension, which reads from appConfigContext (set by
    // appConfigMiddlewareServer with the full AppConfig), not the loader return.
    appConfig: ClientAppConfig;
    basketSnapshot: BasketSnapshot | null;
    maintenance: Maintenance;
    locale: Locale;
    site: Site;
    currency: string;
    selectedStoreInfo: SelectedStoreInfo | null /** @sfdc-extension-line SFDC_EXT_STORE_LOCATOR */;
    correlationId: string;
    pageDesignerMode: 'EDIT' | 'PREVIEW' | undefined;
    // Pre-computed in the loader (server-only) so seo.ts stays out of the client bundle
    seoMeta: MetaDescriptor[];
    // Return as function to prevent i18next instance serialization
    getI18next: () => i18n;
    // Serialized error namespace for the active locale — used by ErrorBoundary on SSR/hydration
    errorTranslations: Record<string, unknown>;
    // CSP nonce for inline scripts; null when security headers middleware is disabled
    nonce: string | null;
} => {
    const session = getAuthServer(context);

    const appConfig = getConfig(context);

    // On the server side, our middleware stores the translations in this i18next object
    // so we'll need to be careful not to accidentally serialize this object (to avoid bloating the html).
    const { i18next } = getTranslation(context);

    // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
    const selectedStoreInfo = context.get(selectedStoreContext) ?? null;
    // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR

    // Get resolved site, locale, and currency from site context middleware
    const siteCtx = context.get(siteContext);
    if (!siteCtx) {
        throw new Error('Site context not found. Ensure siteContextMiddleware runs before loaders.');
    }
    const { locale, site, currency } = siteCtx;

    // Load the application basket provider with the basket snapshot. We are actively not loading the basket, as
    // we want to lazy load the basket when the basket is needed. This prevents low-engagement users from causing
    // unnecessary resource usage in the form of basket creations.
    const basketSnapshot = context.get(basketResourceContext)?.snapshot ?? null;

    // Get correlation ID from middleware for request tracing
    const correlationId = context.get(correlationContext);

    // Get maintenance data from middleware
    const maintenance = context.get(maintenanceContext);

    // Extract only non-sensitive fields for client - tokens stay server-side only
    const clientAuth = getPublicSessionData(session);

    const requestUrl = new URL(request.url);

    const seoMeta = buildSeoMetaDescriptors({
        site,
        appConfig,
        // Use the resolved public origin (custom domain on MRT) rather than
        // requestUrl.origin (lambda-internal hostname on hybrid deployments)
        // so canonical/hreflang URLs match what the customer is actually browsing.
        origin: getAppOrigin(context),
        locale,
        location: { pathname: requestUrl.pathname, search: requestUrl.search },
    });

    // CSP nonce produced by securityHeadersMiddleware; null when middleware is disabled.
    const nonce = getSecurityNonce(context);

    return {
        // Read the precomputed client view from the context — `appConfigMiddlewareServer`
        // strips server-only namespaces once at module init and stashes the result, so this
        // is a zero-cost lookup, not a per-request allocation. The loader return is
        // serialized by React Router into the SSR hydration payload and reaches the browser
        // unconditionally; server-side reads of the stripped namespaces stay available
        // through getConfig(context), which reads the unstripped appConfigContext.
        appConfig: context.get(clientAppConfigContext) as ClientAppConfig,
        basketSnapshot,
        locale,
        site,
        currency,
        selectedStoreInfo /** @sfdc-extension-line SFDC_EXT_STORE_LOCATOR */,
        correlationId,
        maintenance,
        clientAuth,
        seoMeta,
        getI18next: () => i18next,
        errorTranslations: (i18next.getResourceBundle(i18next.language, 'routeError') as Record<string, unknown>) ?? {},
        pageDesignerMode: isDesignModeActive(request) ? 'EDIT' : isPreviewModeActive(request) ? 'PREVIEW' : undefined,
        nonce,
    };
};

// This creates a union type where properties unique to either loader are optional
// Properties present in both loaders remain required
type ServerLoaderData = ReturnType<typeof loader>;
type LoaderData = ServerLoaderData;

export function Layout({ children }: PropsWithChildren) {
    const data = useRouteLoaderData<LoaderData>('root');
    // The root loader already strips server-only namespaces (app.serverExtension) from
    // `appConfig` before returning it, so window.__APP_CONFIG__ inherits the same clean
    // shape \u2014 the loader return is the single source of truth for the client view, since
    // React Router serializes that return into the SSR hydration payload regardless of
    // what the inline window.__APP_CONFIG__ script contains.
    const appConfig = data?.appConfig;
    const appConfigScript = appConfig
        ? `window.__APP_CONFIG__ = ${JSON.stringify(appConfig)
              .replace(/</g, '\\u003c')
              .replace(/>/g, '\\u003e')
              .replace(/&/g, '\\u0026')
              .replace(/\u2028/g, '\\u2028')
              .replace(/\u2029/g, '\\u2029')};`
        : '';

    // React 19 omits the attribute when the value is undefined, so coerce null/missing to undefined.
    // Falls back to the NonceContext so the error path (root loader threw → no
    // loader data) still gets a valid nonce on its inline scripts. The middleware
    // sets `securityContext` *before* `next()`, and `entry.server.tsx` wraps
    // the SSR tree with <NonceContext.Provider>, so the context is populated
    // even when the loader fails.
    const nonceFromContext = useSecurityNonceFromContext();
    const nonce = data?.nonce ?? nonceFromContext ?? undefined;

    const i18next = typeof window === 'undefined' ? data?.getI18next?.() : i18nextOnClient;
    const lang = i18next?.language ?? 'en';
    const dir = i18next?.dir(lang) ?? 'ltr';

    return (
        <html lang={lang} dir={dir}>
            <head>
                <meta charSet="utf-8" />
                <link rel="icon" type="image/x-icon" href={favicon} />
                {appConfig?.links?.preconnect?.map((origin: string) => (
                    <link key={origin} rel="preconnect" href={origin} />
                ))}
                {appConfig?.links?.prefetchDns?.map((origin: string) => (
                    <link key={origin} rel="dns-prefetch" href={origin} />
                ))}
                {appConfig?.links?.prefetch?.map((href: string) => (
                    <link key={href} rel="prefetch" href={href} />
                ))}
                <script
                    nonce={nonce}
                    // Browsers strip the `nonce` content attribute from the DOM after
                    // applying CSP (so scripts can't read each other's nonce), leaving
                    // `nonce=""` in the client DOM while the server rendered the real
                    // value. On this hand-written inline script that surfaces as a
                    // hydration attribute mismatch. React's own <Scripts>/<ScrollRestoration>
                    // handle this internally; here we suppress the warning for the same
                    // browser behavior. The CSP nonce itself still applies correctly.
                    //
                    // Note: this also suppresses any server/client divergence of the
                    // __APP_CONFIG__ body, not just the nonce attribute. Safe today
                    // because appConfig is server-rendered and never mutated on the
                    // client. If client-side config mutation is ever introduced, revisit
                    // this — a real config mismatch would be silently hidden here.
                    suppressHydrationWarning
                    dangerouslySetInnerHTML={{
                        __html: `
                        ${appConfigScript}
                    `,
                    }}
                />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <Links />
            </head>
            <body className="antialiased flex flex-col min-h-screen">
                {children}
                <AppToaster />
                <ScrollRestoration nonce={nonce} />
                <Scripts nonce={nonce} />
            </body>
        </html>
    );
}

/**
 * Error page content component with i18n support.
 * When called without an I18nextProvider (early error before loader ran), t falls back to
 * the key string — callers must pass translated strings directly via props in that case.
 */
function ErrorPageContent({
    status,
    details,
    stack,
    homepageUrl,
    title,
    message,
    secondaryMessage,
    statusDetails,
    goToHomepageLabel,
    allRightsReservedLabel,
}: {
    status: number | undefined;
    details: string | undefined;
    stack: string | undefined;
    homepageUrl: string;
    title: string;
    message?: string;
    secondaryMessage?: string;
    statusDetails?: string;
    goToHomepageLabel: string;
    allRightsReservedLabel: string;
}) {
    return (
        <>
            {/* Simple Header */}
            <header className="bg-header-background text-header-foreground sticky top-0 z-50">
                <div className="section-container">
                    <div className="flex items-center gap-x-4 lg:gap-x-6 h-16">
                        <a href={homepageUrl} className="flex-shrink-0 flex items-center">
                            <Logo className="h-3 lg:h-4 w-auto [filter:var(--header-logo-filter)]" />
                        </a>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="grow pt-8">
                <div className="flex items-center justify-center min-h-[60vh] px-4 py-12">
                    <div className="mx-auto max-w-3xl w-full text-center">
                        {/* Large status code */}
                        {status && <div className="text-error-status font-bold leading-none mb-8">{status}</div>}

                        <h1 className="text-4xl md:text-5xl font-bold mb-6">{title}</h1>

                        {message && <p className="text-lg text-muted-foreground mb-4 max-w-2xl mx-auto">{message}</p>}
                        {secondaryMessage && (
                            <p className="text-base text-muted-foreground mb-4 max-w-2xl mx-auto">{secondaryMessage}</p>
                        )}
                        {statusDetails && (
                            <p className="text-sm text-muted-foreground mb-12 max-w-2xl mx-auto opacity-50">
                                {statusDetails}
                            </p>
                        )}

                        {/* For non-route errors: show technical details */}
                        {!status && details && (
                            <p className="text-lg text-muted-foreground mb-12 max-w-2xl mx-auto">Error: {details}</p>
                        )}

                        {/* Back to home button */}
                        <div>
                            <a
                                href={homepageUrl}
                                className="inline-block bg-primary px-12 py-3 text-base font-semibold text-primary-foreground no-underline transition-colors hover:bg-primary/90">
                                {goToHomepageLabel}
                            </a>
                        </div>

                        {/* Stack trace (only in dev mode with stack) */}
                        {stack && (
                            <div className="mt-16 border border-border bg-muted/30 text-left">
                                <div className="flex items-center px-4 py-3 border-b border-border">
                                    <h2 className="text-sm font-semibold text-foreground">Stack Trace</h2>
                                </div>
                                <pre className="p-4 overflow-auto max-h-80 text-xs leading-relaxed text-foreground/90 font-mono">
                                    <code>{stack}</code>
                                </pre>
                                <div className="px-4 py-3 border-t border-border">
                                    <p className="text-xs text-muted-foreground">
                                        To disable stack traces in production, turn off{' '}
                                        <code className="text-xs">unstable_devTools</code> in your router config.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Simple Footer */}
            <footer className="mt-auto bg-background border-t border-border">
                <div className="mx-auto max-w-7xl section-container py-8">
                    <p className="text-center text-sm text-muted-foreground">
                        © {new Date().getFullYear()} {allRightsReservedLabel}
                    </p>
                </div>
            </footer>
        </>
    );
}

/**
 * Renders the error page using translations from the root loader payload.
 * Requires an I18nextProvider wrapping it.
 */
function TranslatedErrorPageContent({
    status,
    details,
    stack,
    homepageUrl,
}: {
    status: number | undefined;
    details: string | undefined;
    stack: string | undefined;
    homepageUrl: string;
}) {
    const { t } = useTranslation('routeError');

    let title: string;
    let message: string | undefined;
    let secondaryMessage: string | undefined;
    let statusDetails: string | undefined;

    if (status === 404) {
        title = t('404.title');
        message = t('404.message');
        secondaryMessage = t('404.secondaryMessage');
        statusDetails = t('404.details');
    } else if (status === 403) {
        title = t('403.title');
        message = t('403.message');
        secondaryMessage = t('403.secondaryMessage');
    } else if (status === 500) {
        title = t('500.title');
        message = t('500.message');
        secondaryMessage = t('500.secondaryMessage');
    } else {
        title = t('defaultTitle');
    }

    return (
        <ErrorPageContent
            status={status}
            details={details}
            stack={stack}
            homepageUrl={homepageUrl}
            title={title}
            message={message}
            secondaryMessage={secondaryMessage}
            statusDetails={statusDetails}
            goToHomepageLabel={t('goToHomepage')}
            allRightsReservedLabel={t('allRightsReserved')}
        />
    );
}

export function ErrorBoundary({ error }: { error: unknown }) {
    // All hooks must be called unconditionally before any early returns.
    const rootData = useRouteLoaderData<typeof loader>('root');

    const language =
        (typeof window !== 'undefined' && i18nextOnClient ? i18nextOnClient.language : undefined) ||
        (typeof document !== 'undefined' ? document.documentElement.lang : undefined) ||
        rootData?.locale?.id ||
        'en';

    const errorTranslations = rootData?.errorTranslations;
    const fallbackLng = rootData?.appConfig.i18n.fallbackLng ?? 'en';

    // Only created when errorTranslations is available (root loader ran).
    // When the loader did not run (e.g. middleware crash), errorTranslations is undefined and we
    // skip i18next entirely — rendering hardcoded English strings directly avoids any static import
    // of locale JSON that would cause Vite to bundle/preload locale chunks on every page.
    const i18nextInstance = useMemo(() => {
        if (!errorTranslations || Object.keys(errorTranslations).length === 0) return null;
        const resources: Record<string, { routeError: Record<string, unknown> }> = {
            [fallbackLng]: { routeError: errorTranslations },
            [language]: { routeError: errorTranslations },
        };
        const instance = createInstance();
        void instance.use(initReactI18next).init({
            lng: language,
            fallbackLng,
            resources,
            interpolation: { escapeValue: false },
            initAsync: false,
        });
        return instance;
    }, [language, errorTranslations, fallbackLng]);

    const homepageUrl = rootData?.site
        ? buildUrl({
              to: '/',
              urlConfig: rootData.appConfig.url,
              params: {
                  siteId: rootData.site.alias ?? rootData.site.id,
                  localeId: rootData.appConfig.localeAliasMap?.[rootData.locale.id] ?? rootData.locale.id,
              },
          })
        : '/';

    // Redirect maintenance errors before rendering.
    if (error && error.toString().includes('MAINTENANCE_ERROR')) {
        return <Navigate to={routes.maintenance} replace />;
    }

    let status: number | undefined;
    let details: string | undefined;
    let stack: string | undefined;

    if (isRouteErrorResponse(error)) {
        status = error.status;
        details = error.statusText;
    } else if (error instanceof Error) {
        details = error.message;
        stack = error.stack;
    } else if (typeof error === 'string') {
        details = error;
    }

    // Root loader ran — render with active locale translations.
    if (i18nextInstance) {
        return (
            <I18nextProvider i18n={i18nextInstance}>
                <TranslatedErrorPageContent status={status} details={details} stack={stack} homepageUrl={homepageUrl} />
            </I18nextProvider>
        );
    }

    // Root loader did not run (e.g. middleware crash before loader executed).
    // No locale context available — render hardcoded English strings with no i18next dependency.
    const englishContent = {
        404: { title: 'Page not found', message: 'The requested page could not be found.' },
        403: { title: 'Access restricted', message: "You don't have permission to view this page." },
        500: { title: 'Something went wrong', message: 'An unexpected error occurred. Please try again later.' },
    };
    const fallbackContent =
        status && status in englishContent
            ? englishContent[status as keyof typeof englishContent]
            : { title: 'Something went wrong', message: undefined };

    return (
        <ErrorPageContent
            status={status}
            details={details}
            stack={stack}
            homepageUrl={homepageUrl}
            title={fallbackContent.title}
            message={fallbackContent.message}
            goToHomepageLabel="Go to Homepage"
            allRightsReservedLabel="All rights reserved."
        />
    );
}

export default function App({
    loaderData: {
        clientAuth,
        basketSnapshot,
        getI18next,
        currency,
        correlationId,
        pageDesignerMode,
        site,
        locale,
        // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
        selectedStoreInfo,
        // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
    },
}: {
    loaderData: LoaderData;
}) {
    // Currency is always provided by loader (which reads from middleware)
    if (!currency) {
        throw new Error('Currency is required but not provided by loader');
    }

    // Get app configuration from server loader data (initial load) or window.__APP_CONFIG__ (client nav)
    // This ensures config is read from MRT environment variables (via middleware), not baked at build time
    const serverData = useRouteLoaderData('root');
    const appConfig = serverData?.appConfig || (typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined);
    if (!appConfig) {
        throw new Error('App configuration not available - check server loader and window.__APP_CONFIG__');
    }

    // In server-only auth architecture:
    // - clientAuth contains only non-sensitive fields (userType, customerId, usid, etc.)
    // - These values are serialized directly from the server loader
    // - No client middleware or bootstrap needed - server is the single source of truth
    // - Tokens (accessToken, refreshToken) stay server-side only

    // Initialize Page Designer components
    initializeRegistry();

    const i18next = (typeof window === 'undefined' ? getI18next?.() : i18nextOnClient) as i18n;

    // Memoize the providers array to prevent unnecessary remounting of providers on render
    const providers = useMemo(
        () =>
            [
                [I18nextProvider, { i18n: i18next }],
                [ConfigProvider, { config: appConfig }],
                // Site provider will contain info about site/locale/currency on single request.
                // include i18next.language since these infos tend to go together.
                // site will drive the language/locale and currency
                [SiteProvider, { site, locale, language: i18next.language, currency }],
                [AuthProvider, { value: clientAuth }],
                [BasketProvider, { snapshot: basketSnapshot }],
                [CorrelationProvider, { value: correlationId }],
                // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
                [StoreLocatorProvider, { selectedStoreInfo }],
                // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
            ] as const,
        [
            correlationId,
            i18next,
            appConfig,
            currency,
            clientAuth,
            basketSnapshot,
            site,
            locale,
            // @sfdc-extension-block-start SFDC_EXT_STORE_LOCATOR
            selectedStoreInfo,
            // @sfdc-extension-block-end SFDC_EXT_STORE_LOCATOR
        ]
    );

    const hybridEnabled = Boolean(appConfig?.hybrid?.enabled);

    return (
        <ComposeProviders providers={providers}>
            <UITargetProviders>
                <AuthActionExecutor />
                {hybridEnabled && <BackNavigationRevalidator />}
                <PageDesignerProvider
                    clientId="storefront-next"
                    targetOrigin="*"
                    usid={clientAuth?.usid}
                    mode={pageDesignerMode}>
                    <PageDesignerInit />
                    <Outlet />
                </PageDesignerProvider>
                <TrackingConsentBanner />
                {typeof window !== 'undefined' && <PageViewTracker />}
            </UITargetProviders>
            {isCimulateEnabled(appConfig.cimulateAgent?.enabled) && (
                <CimulateAgent cimulateConfiguration={appConfig.cimulateAgent} />
            )}
        </ComposeProviders>
    );
}

/**
 * Component that executes pending actions after authentication
 * This runs on every route to check if there are actions queued from auth interception
 */
function AuthActionExecutor() {
    useExecutePendingAction();
    return null;
}

/**
 * Revalidates loader data once on back/forward (e.g. back from SFRA). Mounted only when
 * hybrid is enabled; ensures UI is fresh after a full-page redirect. No-op when hybrid is off.
 */
function BackNavigationRevalidator() {
    const revalidator = useRevalidator();
    const didRevalidateRef = useRef(false);
    useEffect(() => {
        if (didRevalidateRef.current) return;
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if (nav?.type === 'back_forward' && revalidator.state === 'idle') {
            didRevalidateRef.current = true;
            void revalidator.revalidate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
}
