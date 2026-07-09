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

import { useEffect, useMemo, useRef, useState } from 'react';
import { flushPendingCimulateActions, type CimulateConfig } from './cimulate.utils';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

let globalInjected = false;

const DEFAULT_ELEMENT_ID = 'cimulate-messaging-container';
const DEFAULT_PANEL_WIDTH = '420px';
const GLOBAL_CLASS = 'commerce-client-shopper-agent';

const DEFAULT_THEME = {
    primaryColor: '#0176d3',
    secondaryColor: '#014486',
    fontColor: '#1a202c',
    fontFamily: 'inherit',
    backgroundColor: '#ffffff',
    borderColor: '#dddddd',
};

const DEFAULT_COMPONENT_CONFIG = {
    isOpen: false,
    type: 'dialog' as const,
    options: {
        dialogPosition: 'bottom-right',
    },
};

interface CimulateWindowProps {
    config: CimulateConfig;
}

/**
 * Renders the Commerce Client (Cimulate) messaging widget.
 * Loads the UMD bundle and injects the widget into a container element.
 */
export function CimulateWindow({ config }: CimulateWindowProps) {
    const [scriptLoaded, setScriptLoaded] = useState(false);
    const hasInjectedRef = useRef(false);

    const {
        commerceClientScriptSourceUrl,
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
    } = config;

    const isPanel = commerceClientDisplayMode === 'panel';

    const widgetOptions = useMemo(() => {
        const messagingConfig: Record<string, unknown> = {
            scrt2Url,
            orgId: salesforceOrgId,
            esDeveloperName,
        };
        if (routingAttributes && typeof routingAttributes === 'object') {
            messagingConfig.routingAttributes = routingAttributes;
        }

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
            componentConfig: {
                ...DEFAULT_COMPONENT_CONFIG,
                ...(isPanel
                    ? {
                          type: 'dialog' as const,
                          options: {
                              dialogPosition: 'bottom-right',
                              dialogFullHeight: true,
                              dialogWidth: commerceClientPanelWidth,
                          },
                      }
                    : {
                          type: commerceClientDisplayMode,
                          options: {
                              dialogPosition: 'bottom-right',
                          },
                      }),
            },
            theme: { ...DEFAULT_THEME, ...commerceClientTheme },
        };
    }, [
        commerceClientElementId,
        scrt2Url,
        salesforceOrgId,
        esDeveloperName,
        routingAttributes,
        commerceClientMode,
        commerceClientLogoUrl,
        headerText,
        disclaimerMarkdown,
        commerceClientSearchConfig,
        isDevelopment,
        isPanel,
        commerceClientDisplayMode,
        commerceClientPanelWidth,
        commerceClientTheme,
    ]);

    // Load the Cimulate messaging UMD bundle
    useEffect(() => {
        if (typeof window === 'undefined') return;

        if (window.CimulateMessaging) {
            setScriptLoaded(true);
            return;
        }

        const existingScript = document.querySelector<HTMLScriptElement>(
            `script[src="${commerceClientScriptSourceUrl}"]`
        );
        if (existingScript) {
            if (window.CimulateMessaging) {
                setScriptLoaded(true);
            } else {
                existingScript.addEventListener('load', () => setScriptLoaded(true));
            }
            return;
        }

        const script = document.createElement('script');
        script.src = commerceClientScriptSourceUrl;
        script.async = true;
        script.onload = () => setScriptLoaded(true);
        script.onerror = () => {
            logger.error('Failed to load Cimulate messaging script');
        };
        document.body.appendChild(script);
    }, [commerceClientScriptSourceUrl]);

    // Inject the widget once the bundle is loaded
    useEffect(() => {
        if (!scriptLoaded || hasInjectedRef.current || globalInjected) return;

        try {
            const commerceClient = window.CimulateMessaging;
            if (!commerceClient || typeof commerceClient.injectMessagingWidget !== 'function') {
                logger.error('CimulateMessaging bundle loaded but injectMessagingWidget not available');
                return;
            }

            commerceClient.injectMessagingWidget(widgetOptions as unknown as Record<string, unknown>);
            hasInjectedRef.current = true;
            globalInjected = true;
            flushPendingCimulateActions();
        } catch (error) {
            logger.error('Error injecting Cimulate messaging widget', { error });
        }
    }, [scriptLoaded, widgetOptions]);

    return <div id={commerceClientElementId} data-testid="cimulate-agent-widget" />;
}
