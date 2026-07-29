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

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { classifyTurnstileErrorCode, TURNSTILE_ERROR_FAMILY, type TurnstileErrorFamily } from './turnstile-error-codes';

export interface TurnstileWidgetProps {
    siteKey: string;
    onSuccess: (token: string) => void;
    /**
     * Called on widget error. Receives the Cloudflare error code (e.g. '200500', '300010') and the
     * classified family. Use the family to drive UX (infrastructure vs bot detection vs timeout).
     */
    onError?: (errorCode: string, family: TurnstileErrorFamily) => void;
    onExpire?: () => void;
    /**
     * Called when an interactive challenge goes unsolved within Cloudflare's internal
     * timeout (the duration is intentionally undocumented by Cloudflare so we don't
     * hardcode it). Combined with `refresh-timeout: 'auto'`, the widget auto-resets
     * — this callback is just a UX hook so the shopper can be told the challenge is
     * being refreshed.
     */
    onTimeout?: () => void;
    /** Called when the Turnstile script fails to load (CDN unreachable) or the widget cannot render. Signals that the shopper should not be blocked. */
    onBypass?: () => void;
    /**
     * Called when bot-detection retries are exhausted (3 consecutive non-infrastructure
     * `error-callback` invocations) without producing a token. Distinct from `onBypass`,
     * which signals the form may safely proceed without verification (infrastructure
     * failure). `onRetryExhausted` signals the opposite: the widget tried and was
     * rejected; the form should surface a generic verification-error message and stop
     * waiting for a token. Receives the last error code and its classified family.
     */
    onRetryExhausted?: (errorCode: string, family: TurnstileErrorFamily) => void;
    enabled?: boolean;
    mode?: 'managed' | 'non-interactive' | 'invisible';
    /** Mutable ref that receives a reset function. Call it to invalidate the current token and start a new challenge. */
    resetRef?: React.MutableRefObject<(() => void) | null>;
    /** Mutable ref that receives an execute function. Call it to explicitly start the challenge (only used when execution='execute'). */
    executeRef?: React.MutableRefObject<(() => void) | null>;
}

export function TurnstileWidget({
    siteKey,
    onSuccess,
    onError,
    onExpire,
    onTimeout,
    onBypass,
    onRetryExhausted,
    enabled = true,
    mode = 'managed',
    resetRef,
    executeRef,
}: TurnstileWidgetProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const hasLoggedErrorRef = useRef<boolean>(false);
    // Ensures onBypass fires at most once per widget mount (script load failure only)
    const hasBypassedRef = useRef<boolean>(false);
    // Ensures onRetryExhausted fires at most once per widget mount
    const hasRetryExhaustedRef = useRef<boolean>(false);
    // Caps error-callback resets to avoid infinite loop (e.g. misconfigured site key)
    const errorResetCountRef = useRef<number>(0);
    const MAX_ERROR_RETRIES = 3;

    const triggerBypass = useCallback(() => {
        if (!hasBypassedRef.current && onBypass) {
            hasBypassedRef.current = true;
            onBypass();
        }
    }, [onBypass]);

    // Expose a reset function so the parent can request a fresh token
    useEffect(() => {
        if (resetRef) {
            resetRef.current = () => {
                if (widgetIdRef.current && window.turnstile) {
                    window.turnstile.reset(widgetIdRef.current);
                }
            };
        }
        return () => {
            if (resetRef) {
                resetRef.current = null;
            }
        };
    }, [resetRef]);

    useEffect(() => {
        if (executeRef) {
            executeRef.current = () => {
                if (widgetIdRef.current && window.turnstile) {
                    window.turnstile.execute(widgetIdRef.current);
                }
            };
        }
        return () => {
            if (executeRef) {
                executeRef.current = null;
            }
        };
    }, [executeRef]);

    useEffect(() => {
        if (!enabled || !siteKey || !containerRef.current) {
            return;
        }

        const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        const TURNSTILE_SCRIPT_ID = 'turnstile-script';
        // Tracks pending timers/intervals so the effect cleanup can cancel them — without
        // this, a fast unmount during the 5s load window can fire callbacks against a
        // stale closure (calling onError / triggerBypass on an already-unmounted form).
        let scriptLoadTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let scriptLoadIntervalId: ReturnType<typeof setInterval> | null = null;

        // Initialize Turnstile widget
        const initializeWidget = () => {
            if (!window.turnstile || !containerRef.current || widgetIdRef.current) {
                return;
            }

            try {
                widgetIdRef.current = window.turnstile.render(containerRef.current, {
                    sitekey: siteKey,
                    callback: (token: string) => {
                        errorResetCountRef.current = 0;
                        hasRetryExhaustedRef.current = false;
                        onSuccess(token);
                    },
                    'error-callback': (errorCode: string) => {
                        const family = classifyTurnstileErrorCode(errorCode);
                        if (!hasLoggedErrorRef.current) {
                            // oxlint-disable-next-line no-console
                            console.warn('[Turnstile] Challenge error', { errorCode, family });
                            hasLoggedErrorRef.current = true;
                        }
                        if (onError) {
                            onError(errorCode, family);
                        }
                        // Infrastructure failures: bypass the form so the shopper isn't stuck.
                        if (family === TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE) {
                            triggerBypass();
                            return;
                        }
                        // Bot detection / other: retry with a small cap so a misconfigured key
                        // can't loop forever.
                        errorResetCountRef.current += 1;
                        if (errorResetCountRef.current < MAX_ERROR_RETRIES && widgetIdRef.current && window.turnstile) {
                            window.turnstile.reset(widgetIdRef.current);
                            return;
                        }
                        // Retry cap reached without producing a token. Notify the parent so
                        // the form can surface a verification-error message instead of waiting
                        // forever for a token that will never come.
                        if (!hasRetryExhaustedRef.current && onRetryExhausted) {
                            hasRetryExhaustedRef.current = true;
                            onRetryExhausted(errorCode, family);
                        }
                    },
                    'expired-callback': () => {
                        if (onExpire) {
                            onExpire();
                        }
                    },
                    'timeout-callback': () => {
                        // Interactive challenge was not solved in time. With refresh-timeout
                        // 'auto' the widget will reset itself; we just notify the parent so
                        // it can show a transient "verification refreshed" hint.
                        if (onTimeout) {
                            onTimeout();
                        }
                    },
                    // Cloudflare auto-resets the widget on its documented schedule when the
                    // interactive challenge times out. Replaces our previous manual 120s timer.
                    'refresh-timeout': 'auto',
                    appearance: 'interaction-only',
                    execution: mode === 'non-interactive' ? 'execute' : 'render',
                    theme: 'auto',
                    size: 'normal',
                });
            } catch (error) {
                if (!hasLoggedErrorRef.current) {
                    // oxlint-disable-next-line no-console
                    console.warn('[Turnstile] Failed to initialize:', error);
                    hasLoggedErrorRef.current = true;
                }
                if (onError) {
                    const message = error instanceof Error ? error.message : String(error);
                    onError(`init-error: ${message}`, TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
                }
                triggerBypass();
            }
        };

        // Check if Turnstile is already loaded
        if (window.turnstile) {
            initializeWidget();
        } else {
            // Load Turnstile script if not already present
            let script = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement;

            if (!script) {
                script = document.createElement('script');
                script.id = TURNSTILE_SCRIPT_ID;
                script.src = TURNSTILE_SCRIPT_URL;
                script.async = true;
                script.defer = true;

                // 5s is generous for a CDN script load; if it hasn't arrived, the CDN is likely down.
                scriptLoadTimeoutId = setTimeout(() => {
                    scriptLoadTimeoutId = null;
                    if (!widgetIdRef.current) {
                        if (!hasLoggedErrorRef.current) {
                            // oxlint-disable-next-line no-console
                            console.warn('[Turnstile] Script load timeout');
                            hasLoggedErrorRef.current = true;
                        }
                        if (onError) {
                            onError('script-load-timeout', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
                        }
                        triggerBypass();
                    }
                }, 5000);

                script.onload = () => {
                    if (scriptLoadTimeoutId) {
                        clearTimeout(scriptLoadTimeoutId);
                        scriptLoadTimeoutId = null;
                    }
                    initializeWidget();
                };

                script.onerror = () => {
                    if (scriptLoadTimeoutId) {
                        clearTimeout(scriptLoadTimeoutId);
                        scriptLoadTimeoutId = null;
                    }
                    if (!hasLoggedErrorRef.current) {
                        // oxlint-disable-next-line no-console
                        console.warn('[Turnstile] Failed to load script');
                        hasLoggedErrorRef.current = true;
                    }
                    if (onError) {
                        onError('script-load-failed', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
                    }
                    triggerBypass();
                };

                document.head.appendChild(script);
            } else {
                // Script exists, wait for it to load
                scriptLoadIntervalId = setInterval(() => {
                    if (window.turnstile) {
                        if (scriptLoadIntervalId) {
                            clearInterval(scriptLoadIntervalId);
                            scriptLoadIntervalId = null;
                        }
                        initializeWidget();
                    }
                }, 100);

                // Same 5s budget as the fresh-load path above
                scriptLoadTimeoutId = setTimeout(() => {
                    scriptLoadTimeoutId = null;
                    if (scriptLoadIntervalId) {
                        clearInterval(scriptLoadIntervalId);
                        scriptLoadIntervalId = null;
                    }
                    if (!widgetIdRef.current) {
                        if (!hasLoggedErrorRef.current) {
                            // oxlint-disable-next-line no-console
                            console.warn('[Turnstile] Script load timeout');
                            hasLoggedErrorRef.current = true;
                        }
                        if (onError) {
                            onError('script-load-timeout', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
                        }
                        triggerBypass();
                    }
                }, 5000);
            }
        }

        // Cleanup — runs on unmount or before the next effect re-run. Cancels any pending
        // load timer/interval and removes the widget if it was rendered.
        return () => {
            if (scriptLoadTimeoutId) {
                clearTimeout(scriptLoadTimeoutId);
                scriptLoadTimeoutId = null;
            }
            if (scriptLoadIntervalId) {
                clearInterval(scriptLoadIntervalId);
                scriptLoadIntervalId = null;
            }
            if (widgetIdRef.current && window.turnstile) {
                window.turnstile.remove(widgetIdRef.current);
                widgetIdRef.current = null;
            }
        };
    }, [enabled, siteKey, onSuccess, onError, onExpire, onTimeout, onRetryExhausted, mode, triggerBypass]);

    if (!enabled || !siteKey) {
        return null;
    }

    return (
        <div className="space-y-2">
            <div ref={containerRef} data-testid="turnstile-widget" role="presentation" />
        </div>
    );
}
