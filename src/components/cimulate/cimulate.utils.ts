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

import { createLogger } from '@/lib/logger';

const logger = createLogger();

const onClient = typeof window !== 'undefined';

let pendingOpen = false;
let pendingMessage: string | null = null;

/** Trusted domains for the Commerce Client (Cimulate) messaging bundle. */
const TRUSTED_CIMULATE_DOMAINS = ['cimulate.ai', 'sfcc-store-internal.net'];

export interface CimulateConfig {
    enabled: string | boolean;
    commerceClientScriptSourceUrl: string;
    scrt2Url: string;
    salesforceOrgId: string;
    esDeveloperName: string;
    headerText?: string;
    disclaimerMarkdown?: string;
    commerceClientDisplayMode?: 'panel' | 'dialog' | 'modal';
    commerceClientPanelWidth?: string;
    commerceClientMode?: string;
    commerceClientLogoUrl?: string;
    commerceClientElementId?: string;
    commerceClientSearchConfig?: {
        placeholder?: string;
        buttonLabel?: string;
        buttonType?: string;
        buttonIconUrl?: string;
    };
    commerceClientTheme?: Record<string, string>;
    routingAttributes?: Record<string, unknown>;
    isDevelopment?: string;
    /**
     * Optional regex patterns matched against the current pathname. When any pattern
     * matches, the agent widget is hidden on that page. See `ShopperAgentConfig`.
     */
    disabledPathPatterns?: string[];
    /** Optional widget options; the `cc_` prefix is stripped when mapped in `buildMessagingWidgetOptions`. */
    cc_dialogFullHeight?: string | boolean;
    cc_widgetPosition?: string;
    cc_isOpen?: string | boolean;
    cc_enableDownloadTranscript?: string | boolean;
    cc_enableEscalationToAgent?: string | boolean;
    cc_capabilitiesVersion?: string;
    cc_messageAlignment?: string;
    cc_autoScroll?: string | boolean;
    cc_openLinksInNewTab?: string | boolean;
    cc_showProductDescription?: string | boolean;
    cc_showProductCaptions?: string | boolean;
    cc_headerConfig?: Record<string, unknown>;
    cc_suggestionButtonConfig?: Record<string, unknown>;
    cc_promptsConfig?: Record<string, unknown>;
    cc_overridesUrl?: string;
    cc_overrides?: Record<string, unknown>;
    cc_progressStepsLimit?: string | number;
}

const DEFAULT_ELEMENT_ID = 'cimulate-messaging-container';
const DEFAULT_PANEL_WIDTH = '420px';
const GLOBAL_CLASS = 'commerce-client-shopper-agent';
const DEFAULT_CAPABILITIES_VERSION = '65';

/** Theme defaults; `commerceClientTheme` is merged over these. */
const DEFAULT_THEME: Record<string, string> = {
    primaryColor: '#0176d3',
    secondaryColor: '#014486',
    fontColor: '#1a202c',
    fontFamily: 'inherit',
    backgroundColor: '#ffffff',
    borderColor: '#dddddd',
};

/** Coerces a string/boolean config value to a boolean; `undefined` when unset so callers can omit it. */
export function toWidgetBoolean(value: string | boolean | undefined | null): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return undefined;
    return normalized === 'true';
}

/** Coerces a string/number config value to a finite number; `undefined` when unset or non-numeric. */
export function toWidgetNumber(value: string | number | undefined | null): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
}

/** True when the override script URL is HTTPS. */
export function validateOverridesUrl(url: string): boolean {
    try {
        return new URL(url).protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Resolves the single component-override source: an inline `cc_overrides` map wins over a
 * `cc_overridesUrl` (which must be HTTPS). Shared by the widget builder and the CSP contributor.
 */
export function resolveCimulateOverrideOptions(
    config: Pick<CimulateConfig, 'cc_overrides' | 'cc_overridesUrl'> | undefined | null
): { overrides?: Record<string, unknown>; overridesUrl?: string } {
    const overrides = config?.cc_overrides;
    if (overrides && typeof overrides === 'object' && Object.keys(overrides).length > 0) {
        return { overrides };
    }
    const overridesUrl = config?.cc_overridesUrl;
    if (overridesUrl && validateOverridesUrl(overridesUrl)) {
        return { overridesUrl };
    }
    return {};
}

/** Shape of the options object passed to `window.CimulateMessaging.injectMessagingWidget`. */
export interface MessagingWidgetOptions {
    elementId: string;
    mode?: string;
    messagingConfig: Record<string, unknown>;
    logoUrl?: string;
    headerText?: string;
    disclaimerMarkdown?: string;
    searchConfig?: Record<string, unknown>;
    globalClassName: string;
    isDevelopment: boolean;
    componentConfig: {
        isOpen: boolean;
        type: string;
        options: Record<string, unknown>;
    };
    theme: Record<string, string>;
    overrides?: Record<string, unknown>;
    overridesUrl?: string;
    headerConfig?: Record<string, unknown>;
    suggestionButtonConfig?: Record<string, unknown>;
    promptsConfig?: Record<string, unknown>;
    messageAlignment?: string;
    autoScroll?: boolean;
    openLinksInNewTab?: boolean;
    showProductDescription?: boolean;
    progressStepsLimit?: number;
}

/**
 * Builds the `injectMessagingWidget` options from the resolved config. Pure/side-effect-free
 * so it can be unit-tested without a DOM. Connection fields map to `messagingConfig`; the
 * `cc_` knobs map to the widget's option names — some with defaults, the rest forwarded only
 * when set (so the widget's own default otherwise applies).
 */
export function buildMessagingWidgetOptions(config: CimulateConfig): MessagingWidgetOptions {
    const {
        scrt2Url,
        salesforceOrgId,
        esDeveloperName,
        commerceClientMode = 'messaging',
        commerceClientLogoUrl,
        headerText,
        disclaimerMarkdown,
        commerceClientElementId = DEFAULT_ELEMENT_ID,
        commerceClientDisplayMode = 'panel',
        commerceClientPanelWidth = DEFAULT_PANEL_WIDTH,
        commerceClientSearchConfig,
        commerceClientTheme,
        routingAttributes,
        isDevelopment = 'false',
        cc_dialogFullHeight,
        cc_widgetPosition,
        cc_isOpen,
        cc_enableDownloadTranscript,
        cc_enableEscalationToAgent,
        cc_capabilitiesVersion = DEFAULT_CAPABILITIES_VERSION,
        cc_messageAlignment,
        cc_autoScroll,
        cc_openLinksInNewTab,
        cc_showProductDescription,
        cc_showProductCaptions,
        cc_headerConfig,
        cc_suggestionButtonConfig,
        cc_promptsConfig,
        cc_progressStepsLimit,
    } = config;

    const isPanel = commerceClientDisplayMode === 'panel';
    const dialogPosition = cc_widgetPosition || 'bottom-right';
    const isOpen = toWidgetBoolean(cc_isOpen) ?? false;
    const dialogFullHeight = toWidgetBoolean(cc_dialogFullHeight) ?? true;

    const messagingConfig: Record<string, unknown> = {
        scrt2Url,
        orgId: salesforceOrgId,
        esDeveloperName,
        capabilitiesVersion: cc_capabilitiesVersion,
        enableDownloadTranscript: toWidgetBoolean(cc_enableDownloadTranscript) ?? true,
        enableEscalationToAgent: toWidgetBoolean(cc_enableEscalationToAgent) ?? false,
    };
    if (routingAttributes && typeof routingAttributes === 'object') {
        messagingConfig.routingAttributes = routingAttributes;
    }
    const showProductCaptions = toWidgetBoolean(cc_showProductCaptions);
    if (showProductCaptions !== undefined) {
        messagingConfig.showProductCaptions = showProductCaptions;
    }

    // 'panel' renders as a full-height dialog; other modes keep their own type.
    const componentConfig = isPanel
        ? {
              isOpen,
              type: 'dialog',
              options: {
                  dialogPosition,
                  dialogFullHeight,
                  dialogWidth: commerceClientPanelWidth,
              },
          }
        : {
              isOpen,
              type: commerceClientDisplayMode,
              options: { dialogPosition },
          };

    const autoScroll = toWidgetBoolean(cc_autoScroll);
    const openLinksInNewTab = toWidgetBoolean(cc_openLinksInNewTab);
    const showProductDescription = toWidgetBoolean(cc_showProductDescription);
    const progressStepsLimit = toWidgetNumber(cc_progressStepsLimit);

    return {
        elementId: commerceClientElementId,
        ...(commerceClientMode ? { mode: commerceClientMode } : {}),
        messagingConfig,
        ...(commerceClientLogoUrl ? { logoUrl: commerceClientLogoUrl } : {}),
        ...(headerText ? { headerText } : {}),
        ...(disclaimerMarkdown ? { disclaimerMarkdown } : {}),
        ...(commerceClientSearchConfig && typeof commerceClientSearchConfig === 'object'
            ? { searchConfig: commerceClientSearchConfig }
            : {}),
        globalClassName: GLOBAL_CLASS,
        isDevelopment: isDevelopment === 'true',
        componentConfig,
        theme: { ...DEFAULT_THEME, ...commerceClientTheme },
        ...resolveCimulateOverrideOptions(config),
        // Forwarded only when set.
        ...(cc_headerConfig && typeof cc_headerConfig === 'object' ? { headerConfig: cc_headerConfig } : {}),
        ...(cc_suggestionButtonConfig && typeof cc_suggestionButtonConfig === 'object'
            ? { suggestionButtonConfig: cc_suggestionButtonConfig }
            : {}),
        ...(cc_promptsConfig && typeof cc_promptsConfig === 'object' ? { promptsConfig: cc_promptsConfig } : {}),
        ...(cc_messageAlignment ? { messageAlignment: cc_messageAlignment } : {}),
        ...(autoScroll !== undefined ? { autoScroll } : {}),
        ...(openLinksInNewTab !== undefined ? { openLinksInNewTab } : {}),
        ...(showProductDescription !== undefined ? { showProductDescription } : {}),
        ...(progressStepsLimit !== undefined ? { progressStepsLimit } : {}),
    };
}

/**
 * Validates that a URL is served from a trusted Commerce Client domain.
 */
export function validateCimulateDomain(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        return TRUSTED_CIMULATE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch {
        return false;
    }
}

/**
 * Validates the Cimulate configuration. Required fields: scrt2Url, salesforceOrgId,
 * esDeveloperName, and commerceClientScriptSourceUrl.
 */
export function validateCimulateConfig(config: unknown): config is CimulateConfig {
    if (!config || typeof config !== 'object') {
        logger.error('Cimulate configuration must be an object.');
        return false;
    }

    const typedConfig = config as Record<string, unknown>;

    const requiredValues: Record<string, unknown> = {
        scrt2Url: typedConfig.scrt2Url,
        salesforceOrgId: typedConfig.salesforceOrgId,
        esDeveloperName: typedConfig.esDeveloperName,
        commerceClientScriptSourceUrl: typedConfig.commerceClientScriptSourceUrl,
    };

    const isValid = Object.values(requiredValues).every((value) => typeof value === 'string' && value.trim() !== '');

    if (!isValid) {
        logger.error(
            'Invalid Cimulate config. Required: scrt2Url, salesforceOrgId, esDeveloperName, and commerceClientScriptSourceUrl.'
        );
        return false;
    }

    if (!validateCimulateDomain(typedConfig.commerceClientScriptSourceUrl as string)) {
        logger.error(
            'Commerce Client script URL must be from a trusted cimulate.ai or sfcc-store-internal.net domain.'
        );
        return false;
    }

    return true;
}

/**
 * Checks if Cimulate is enabled via config. Does NOT gate on `typeof window`
 * so that server and client return the same value (avoids hydration mismatch).
 */
export function isCimulateEnabled(enabled: string | boolean | undefined): boolean {
    return enabled === 'true' || enabled === true;
}

/**
 * Resolves the effective Shopper Agent configuration from the app config, preferring
 * the new `commerce.shopperAgent` (`PUBLIC__app__commerce__shopperAgent`) over the
 * legacy top-level `cimulateAgent` (`PUBLIC__app__cimulateAgent`).
 *
 * Precedence:
 *   1. `commerce.shopperAgent` when it is "populated" — i.e. has a truthy `enabled`
 *      value or a non-empty `commerceClientScriptSourceUrl`. This is the signal that
 *      the merchant set `PUBLIC__app__commerce__shopperAgent`; the shipped default
 *      leaves both fields empty.
 *   2. Otherwise the legacy top-level `cimulateAgent`, if any.
 *
 * Returning `undefined` means neither key is configured.
 */
export function resolveShopperAgentConfig<
    T extends {
        commerce?: { shopperAgent?: CimulateConfig };
        cimulateAgent?: CimulateConfig;
    },
>(appConfig: T | undefined | null): CimulateConfig | undefined {
    if (!appConfig) return undefined;
    const preferred = appConfig.commerce?.shopperAgent;
    if (preferred && isShopperAgentPopulated(preferred)) {
        return preferred;
    }
    return appConfig.cimulateAgent;
}

function isShopperAgentPopulated(cfg: CimulateConfig): boolean {
    if (cfg.enabled === true || cfg.enabled === 'true') return true;
    return typeof cfg.commerceClientScriptSourceUrl === 'string' && cfg.commerceClientScriptSourceUrl !== '';
}

/**
 * Opens the Commerce Client widget via the Cimulate SDK.
 * If the SDK hasn't loaded yet, queues the request for when it becomes available.
 */
export function openCimulateWidget(show = true): void {
    if (!onClient) return;

    try {
        const components = window.CimulateMessaging?.eventHandlers?.components;
        if (components && typeof components.toggleWidgetOpen === 'function') {
            components.toggleWidgetOpen(show);
        } else {
            pendingOpen = show;
        }
    } catch (error) {
        logger.error('Error toggling Cimulate widget', { error });
    }
}

/**
 * Flushes any pending open request queued before the SDK was ready.
 * Called by CimulateWindow after widget injection completes.
 */
export function flushPendingCimulateActions(): void {
    if (pendingOpen) {
        pendingOpen = false;
        openCimulateWidget(true);
    }
    if (pendingMessage) {
        const message = pendingMessage;
        const send = window.CimulateMessaging?.eventHandlers?.messaging?.sendMessage;
        if (typeof send === 'function') {
            pendingMessage = null;
            send(message);
        }
    }
}

/**
 * Opens the Cimulate (Commerce Client) agent widget.
 * Dispatches the load event first so the chunk loads eagerly if idle hasn't fired yet.
 */
export function openAgentWidget(): void {
    if (!onClient) return;

    try {
        window.dispatchEvent(new Event(CIMULATE_LOAD_EVENT));
        openCimulateWidget(true);
    } catch (error) {
        logger.error('Error opening agent widget', { error });
    }
}

/**
 * Opens the Commerce Client widget and sends a shopper message.
 * If the SDK hasn't loaded yet, queues the message for when it becomes available.
 */
export function openAgentWidgetAndSendMessage(message: string): void {
    if (!onClient) return;

    try {
        window.dispatchEvent(new Event(CIMULATE_LOAD_EVENT));
        openCimulateWidget(true);
        const send = window.CimulateMessaging?.eventHandlers?.messaging?.sendMessage;
        if (typeof send === 'function') {
            send(message);
        } else {
            pendingMessage = message;
        }
    } catch (error) {
        logger.error('Error opening agent widget with message', { error });
    }
}

/** Custom event to trigger Cimulate chunk load when user interacts before idle. */
export const CIMULATE_LOAD_EVENT = 'cimulate:load';

declare global {
    interface Window {
        CimulateMessaging?: {
            injectMessagingWidget: (options: Record<string, unknown>) => void;
            eventHandlers?: {
                components?: {
                    toggleWidgetOpen?: (show: boolean) => void;
                };
                messaging?: {
                    sendMessage?: (message: string) => void;
                };
            };
        };
    }
}
