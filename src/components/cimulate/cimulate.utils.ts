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
