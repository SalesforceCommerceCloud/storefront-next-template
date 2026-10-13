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
import { buildMessagingWidgetOptions, flushPendingCimulateActions, type CimulateConfig } from './cimulate.utils';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

let globalInjected = false;

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

    return <div id={widgetOptions.elementId} data-testid="cimulate-agent-widget" />;
}
