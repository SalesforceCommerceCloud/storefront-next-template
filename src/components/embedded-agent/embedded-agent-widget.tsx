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
import { useAuth } from '@/providers/auth';
import { loadInlineAgentWidget } from './load-inline-agent-widget';
import {
    DEFAULT_CAPABILITIES_VERSION,
    DEFAULT_PRODUCT_ID_PATTERN,
    isEmbeddedAgentConfigured,
    resolveWidgetScriptSrc,
    type EmbeddedAgentConfig,
} from './embedded-agent.utils';

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
    const assisted = useAuth()?.authMode === 'trusted-agent';
    const [ready, setReady] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const configured = isEmbeddedAgentConfigured(config) && !assisted;
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
        loadInlineAgentWidget(scriptSrc)
            .then(() => {
                if (!cancelled) setReady(true);
            })
            .catch(() => {
                // The loader logs registration failures.
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

    return (
        <>
            <link rel="preconnect" href={new URL(scriptSrc).origin} />
            <div ref={containerRef} data-testid="embedded-agent-widget" />
        </>
    );
}

export default EmbeddedAgentWidget;
