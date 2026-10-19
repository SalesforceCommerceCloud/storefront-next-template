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

import { useEffect, useRef, useState } from 'react';
import { createLogger, serializeError } from '@/lib/logger';
import {
    DEFAULT_CAPABILITIES_VERSION,
    DEFAULT_PRODUCT_ID_PATTERN,
    isEmbeddedAgentConfigured,
    resolveWidgetScriptSrc,
    type EmbeddedAgentConfig,
} from './embedded-agent.utils';

const logger = createLogger({ component: 'EmbeddedAgentWidget' });

// Module-scoped so repeated mounts share one load across SPA navigations.
let readyPromise: Promise<void> | null = null;

function ensureWidget(scriptSrc: string): Promise<void> {
    if (readyPromise) return readyPromise;

    if (customElements.get('inline-agent-widget')) {
        readyPromise = Promise.resolve();
        return readyPromise;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);
    const script = existing ?? document.createElement('script');
    if (!existing) {
        script.src = scriptSrc;
        script.async = true;
        document.head.appendChild(script);
    }

    const pending = new Promise<void>((resolve, reject) => {
        const onError = (event: Event | string) => {
            logger.error('inline-agent-widget UMD failed to load', { scriptSrc, ...serializeError(event) });
            // Drop the failed <script> so the next mount re-requests from scratch
            // instead of latching onto a stale node that will never fire 'load'.
            script.remove();
            readyPromise = null;
            reject(new Error(`Failed to load inline-agent-widget UMD at ${scriptSrc}`));
        };
        script.addEventListener('error', onError, { once: true });

        customElements
            .whenDefined('inline-agent-widget')
            .then(() => {
                if (!customElements.get('inline-agent-widget') && window.InlineAgentWidget?.defineElement) {
                    window.InlineAgentWidget.defineElement();
                }
                resolve();
            })
            .catch(reject);
    });

    readyPromise = pending;
    return pending;
}

/** Stable value-key so pdp-questions dep tracks content, not identity. */
function pdpQuestionsKey(pdpQuestions: string[] | undefined): string {
    return Array.isArray(pdpQuestions) && pdpQuestions.length > 0 ? JSON.stringify(pdpQuestions) : '';
}

interface EmbeddedAgentWidgetProps {
    config: EmbeddedAgentConfig;
    pdpQuestions?: string[];
    productName?: string;
}

export function EmbeddedAgentWidget({ config, pdpQuestions, productName }: EmbeddedAgentWidgetProps) {
    const [ready, setReady] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const configured = isEmbeddedAgentConfigured(config);
    const questionsKey = pdpQuestionsKey(pdpQuestions);
    const scriptSrc = resolveWidgetScriptSrc(config);
    // Depend on primitive config values, not the object. Root-loader revalidation
    // produces a new config object even when nothing material changed, and
    // re-mounting the element drops the SCRT2 conversation + persisted session.
    const {
        scrt2Url,
        orgId,
        esDeveloperName,
        capabilitiesVersion,
        placeholder,
        persistSession,
        enableLogging,
        productIdParam,
        productIdPattern,
    } = config;
    const persistSessionAttr = persistSession !== false;
    const enableLoggingAttr = !!enableLogging;
    const effectivePattern =
        productIdPattern && productIdPattern.trim() ? productIdPattern : DEFAULT_PRODUCT_ID_PATTERN;

    useEffect(() => {
        if (typeof window === 'undefined' || !configured) return;
        let cancelled = false;
        ensureWidget(scriptSrc)
            .then(() => {
                if (!cancelled) setReady(true);
            })
            .catch(() => {
                // Error already logged in ensureWidget; leave ready=false so the host
                // renders nothing visible rather than a broken element shell.
            });
        return () => {
            cancelled = true;
        };
    }, [configured, scriptSrc]);

    useEffect(() => {
        if (!configured || !ready || !containerRef.current) return;
        if (containerRef.current.querySelector('inline-agent-widget')) return;

        const el = document.createElement('inline-agent-widget');
        el.setAttribute('scrt2-url', scrt2Url);
        el.setAttribute('org-id', orgId);
        el.setAttribute('es-developer-name', esDeveloperName);
        el.setAttribute('capabilities-version', capabilitiesVersion ?? DEFAULT_CAPABILITIES_VERSION);
        if (placeholder) el.setAttribute('placeholder', placeholder);
        if (persistSessionAttr) el.setAttribute('persist-session', '');
        if (enableLoggingAttr) el.setAttribute('enable-logging', '');
        if (productIdParam) el.setAttribute('product-id-param', productIdParam);
        el.setAttribute('product-id-pattern', effectivePattern);
        if (questionsKey) el.setAttribute('pdp-questions', questionsKey);
        if (productName) el.setAttribute('product-name', productName);

        containerRef.current.appendChild(el);

        return () => {
            el.remove();
        };
        // Re-creating on pdp-questions / productName change would drop the SCRT2 session —
        // those are kept in sync by the two effects below instead.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        configured,
        ready,
        scrt2Url,
        orgId,
        esDeveloperName,
        capabilitiesVersion,
        placeholder,
        persistSessionAttr,
        enableLoggingAttr,
        productIdParam,
        effectivePattern,
    ]);

    useEffect(() => {
        if (!configured || !ready || !containerRef.current) return;
        const el = containerRef.current.querySelector('inline-agent-widget');
        if (!el) return;
        if (questionsKey) el.setAttribute('pdp-questions', questionsKey);
        else el.removeAttribute('pdp-questions');
    }, [configured, ready, questionsKey]);

    useEffect(() => {
        if (!configured || !ready || !containerRef.current) return;
        const el = containerRef.current.querySelector('inline-agent-widget');
        if (!el) return;
        if (productName) el.setAttribute('product-name', productName);
        else el.removeAttribute('product-name');
    }, [configured, ready, productName]);

    if (!configured) return null;

    return <div ref={containerRef} data-testid="embedded-agent-widget" />;
}

export default EmbeddedAgentWidget;
