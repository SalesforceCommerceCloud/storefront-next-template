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
import { linkCimulateIdentity } from './cimulate-identity-link';
import { buildMessagingWidgetOptions, flushPendingCimulateActions, type CimulateConfig } from './cimulate.utils';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

let globalInjected = false;

const MAX_IDENTITY_LINK_ATTEMPTS = 2;
const DEFAULT_IDENTITY_LINK_RETRY_MS = 1000;

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
    const identityLinkStartedRef = useRef(false);

    const { commerceClientScriptSourceUrl } = config;

    // Config → widget-option mapping lives in buildMessagingWidgetOptions (unit-testable, no DOM).
    const widgetOptions = useMemo(() => buildMessagingWidgetOptions(config), [config]);

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

    // Link only after the SDK signals that a fresh conversation is connected.
    useEffect(() => {
        if (!scriptLoaded) return;

        const commerceClient = window.CimulateMessaging;
        const readyEvent = commerceClient?.CIMULATE_WIDGET_READY_EVENT;
        let disposed = false;
        let retryTimer: number | undefined;

        const attemptIdentityLink = async (attempt: number): Promise<void> => {
            const result = await linkCimulateIdentity();
            if (disposed || result.success) return;

            if (result.error.retryable && attempt < MAX_IDENTITY_LINK_ATTEMPTS) {
                const retryDelay =
                    result.error.retryAfterSeconds === undefined
                        ? DEFAULT_IDENTITY_LINK_RETRY_MS
                        : result.error.retryAfterSeconds * 1000;
                retryTimer = window.setTimeout(() => void attemptIdentityLink(attempt + 1), retryDelay);
                return;
            }

            logger.error('Cimulate identity linking failed', { code: result.error.code });
        };

        const handleWidgetReady = (): void => {
            if (identityLinkStartedRef.current) return;
            identityLinkStartedRef.current = true;
            void attemptIdentityLink(1);
        };

        if (readyEvent) window.addEventListener(readyEvent, handleWidgetReady);

        return () => {
            disposed = true;
            if (retryTimer !== undefined) window.clearTimeout(retryTimer);
            if (readyEvent) window.removeEventListener(readyEvent, handleWidgetReady);
        };
    }, [scriptLoaded]);

    // Inject the widget once the bundle is loaded.
    useEffect(() => {
        if (!scriptLoaded || hasInjectedRef.current || globalInjected) return;

        const commerceClient = window.CimulateMessaging;
        try {
            if (!commerceClient || typeof commerceClient.injectMessagingWidget !== 'function') {
                logger.error('CimulateMessaging bundle loaded but injectMessagingWidget not available');
            } else {
                commerceClient.injectMessagingWidget(widgetOptions as unknown as Record<string, unknown>);
                hasInjectedRef.current = true;
                globalInjected = true;
                flushPendingCimulateActions();
            }
        } catch (error) {
            logger.error('Error injecting Cimulate messaging widget', { error });
        }
    }, [scriptLoaded, widgetOptions]);

    return <div id={widgetOptions.elementId} data-testid="cimulate-agent-widget" />;
}
