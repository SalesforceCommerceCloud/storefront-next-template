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
