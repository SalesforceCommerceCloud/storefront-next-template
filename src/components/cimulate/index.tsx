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

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CIMULATE_LOAD_EVENT, type CimulateConfig } from './cimulate.utils';

const CimulateUI = lazy(() => import('./cimulate-ui'));

const IDLE_TIMEOUT_MS = 2000;

function scheduleIdle(callback: IdleRequestCallback, options?: IdleRequestOptions): number {
    if (typeof window.requestIdleCallback === 'function') {
        return window.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS, ...options });
    }
    return window.setTimeout(
        () => callback({ didTimeout: true, timeRemaining: () => 0 }),
        options?.timeout ?? IDLE_TIMEOUT_MS
    ) as unknown as number;
}

function cancelIdle(handle: number): void {
    if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(handle);
    } else {
        clearTimeout(handle);
    }
}

interface CimulateAgentProps {
    cimulateConfiguration?: CimulateConfig;
}

/**
 * Cimulate (Commerce Client) agent wrapper: defers loading the chunk until the browser
 * is idle via requestIdleCallback, so initial hydration is not blocked. If the user
 * clicks the agent button before idle fires, we load on demand.
 */
function CimulateAgent({ cimulateConfiguration }: CimulateAgentProps) {
    const [deferReady, setDeferReady] = useState(false);
    const idleHandleRef = useRef<number | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        let cancelled = false;

        const startLoad = (): void => {
            if (cancelled) return;
            if (idleHandleRef.current != null) {
                cancelIdle(idleHandleRef.current);
                idleHandleRef.current = null;
            }
            void import('./cimulate-ui');
            if (!cancelled) setDeferReady(true);
        };

        idleHandleRef.current = scheduleIdle(
            () => {
                idleHandleRef.current = null;
                startLoad();
            },
            { timeout: IDLE_TIMEOUT_MS }
        );

        const handleLoadEvent = (): void => {
            startLoad();
        };
        window.addEventListener(CIMULATE_LOAD_EVENT, handleLoadEvent);

        return () => {
            cancelled = true;
            if (idleHandleRef.current != null) {
                cancelIdle(idleHandleRef.current);
                idleHandleRef.current = null;
            }
            window.removeEventListener(CIMULATE_LOAD_EVENT, handleLoadEvent);
        };
    }, []);

    if (!deferReady) {
        return null;
    }

    return (
        <Suspense fallback={null}>
            <CimulateUI cimulateConfiguration={cimulateConfiguration} />
        </Suspense>
    );
}

export default CimulateAgent;

/* eslint-disable react-refresh/only-export-components -- barrel re-exports */
export {
    openCimulateWidget,
    openAgentWidget,
    validateCimulateConfig,
    isCimulateEnabled,
    CIMULATE_LOAD_EVENT,
} from './cimulate.utils';
export type { CimulateConfig } from './cimulate.utils';
/* eslint-enable react-refresh/only-export-components */
