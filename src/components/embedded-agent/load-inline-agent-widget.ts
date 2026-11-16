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

import { createLogger, serializeError } from '@/lib/logger';

const logger = createLogger({ component: 'EmbeddedAgentWidget' });
let readyPromise: Promise<void> | null = null;

export function loadInlineAgentWidget(scriptSrc: string): Promise<void> {
    if (readyPromise) return readyPromise;
    if (customElements.get('inline-agent-widget')) {
        readyPromise = Promise.resolve();
        return readyPromise;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);
    const script = existing ?? document.createElement('script');
    readyPromise = new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            script.removeEventListener('error', onError);
            if (error) {
                readyPromise = null;
                logger.error('inline-agent-widget UMD failed to load', { scriptSrc, ...serializeError(error) });
                reject(error);
            } else {
                resolve();
            }
        };
        const onError = () => {
            script.remove();
            finish(new Error(`Failed to load inline-agent-widget UMD at ${scriptSrc}`));
        };
        const timer = setTimeout(
            () =>
                logger.warn('Inline agent widget CDN script registration is taking longer than 10 seconds', {
                    scriptSrc,
                }),
            10000
        );
        script.addEventListener('error', onError, { once: true });
        customElements.whenDefined('inline-agent-widget').then(() => finish(), finish);
    });
    if (!existing) {
        script.src = scriptSrc;
        script.async = true;
        document.head.appendChild(script);
    }
    return readyPromise;
}
