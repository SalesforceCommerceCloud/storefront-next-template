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
/* oxlint-disable @typescript-eslint/no-non-null-assertion -- test harness asserts captured Turnstile API callbacks after render */
import { render, screen, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { TurnstileWidget } from './turnstile-widget';
import { TURNSTILE_ERROR_FAMILY } from './turnstile-error-codes';

type TurnstileRenderOptions = {
    sitekey: string;
    callback: (token: string) => void;
    'error-callback': (errorCode: string) => void;
    'expired-callback': () => void;
    'timeout-callback': () => void;
    'refresh-timeout': string;
    appearance: string;
    execution: string;
    theme: string;
    size: string;
};

type MockTurnstile = {
    render: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
};

describe('TurnstileWidget', () => {
    let capturedOptions: TurnstileRenderOptions | null;
    let mockTurnstile: MockTurnstile;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    function installTurnstile() {
        // Cast through unknown — MockTurnstile is a vi.fn stand-in, not the real Window.turnstile shape.
        (window as unknown as { turnstile?: MockTurnstile }).turnstile = mockTurnstile;
    }

    function uninstallTurnstile() {
        delete (window as unknown as { turnstile?: MockTurnstile }).turnstile;
    }

    beforeEach(() => {
        capturedOptions = null;
        mockTurnstile = {
            render: vi.fn((_, options: TurnstileRenderOptions) => {
                capturedOptions = options;
                return 'widget-id-1';
            }),
            reset: vi.fn(),
            remove: vi.fn(),
            execute: vi.fn(),
        };
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        uninstallTurnstile();
        document.getElementById('turnstile-script')?.remove();
        consoleWarnSpy.mockRestore();
    });

    // ── Rendering conditions ───────────────────────────────────────────────────

    describe('rendering conditions', () => {
        test('returns null when enabled=false', () => {
            installTurnstile();
            const { container } = render(<TurnstileWidget siteKey="test-key" onSuccess={vi.fn()} enabled={false} />);
            expect(container.firstChild).toBeNull();
        });

        test('returns null when siteKey is empty string', () => {
            installTurnstile();
            const { container } = render(<TurnstileWidget siteKey="" onSuccess={vi.fn()} />);
            expect(container.firstChild).toBeNull();
        });

        test('renders data-testid="turnstile-widget" when enabled with valid siteKey', () => {
            installTurnstile();
            render(<TurnstileWidget siteKey="test-site-key" onSuccess={vi.fn()} />);
            expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
        });
    });

    // ── Window.turnstile already present ──────────────────────────────────────

    describe('when window.turnstile is already present', () => {
        beforeEach(() => {
            installTurnstile();
        });

        test('calls turnstile.render with correct options for managed mode', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} mode="managed" />);

            expect(mockTurnstile.render).toHaveBeenCalledOnce();
            expect(capturedOptions).toMatchObject({
                sitekey: 'my-site-key',
                'refresh-timeout': 'auto',
                appearance: 'interaction-only',
                execution: 'render',
                theme: 'auto',
                size: 'normal',
            });
            expect(typeof capturedOptions?.callback).toBe('function');
            expect(typeof capturedOptions?.['error-callback']).toBe('function');
            expect(typeof capturedOptions?.['expired-callback']).toBe('function');
            expect(typeof capturedOptions?.['timeout-callback']).toBe('function');
        });

        test('uses execution="execute" for non-interactive mode', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} mode="non-interactive" />);
            expect(capturedOptions?.execution).toBe('execute');
        });

        test('uses execution="render" for invisible mode', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} mode="invisible" />);
            expect(capturedOptions?.execution).toBe('render');
        });

        test('success callback calls onSuccess with the token', () => {
            const onSuccess = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={onSuccess} />);

            capturedOptions!.callback('tok-abc');

            expect(onSuccess).toHaveBeenCalledWith('tok-abc');
        });

        test('success callback resets error retry state so subsequent errors can reset again', () => {
            const onRetryExhausted = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onRetryExhausted={onRetryExhausted} />);

            // Two bot-detection errors (count → 1, 2; both < 3 → reset)
            capturedOptions!['error-callback']('300010');
            capturedOptions!['error-callback']('300010');

            // Success resets errorResetCount → 0 and hasRetryExhausted → false
            capturedOptions!.callback('fresh-token');

            // Two more errors: count → 1, 2 again — still under the cap
            capturedOptions!['error-callback']('300010');
            capturedOptions!['error-callback']('300010');

            expect(onRetryExhausted).not.toHaveBeenCalled();
        });

        // ── Error callback: infrastructure ─────────────────────────────────────

        test('infrastructure error (200xxx) calls onError and onBypass', () => {
            const onError = vi.fn();
            const onBypass = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} onBypass={onBypass} />);

            capturedOptions!['error-callback']('200500');

            expect(onError).toHaveBeenCalledWith('200500', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
            expect(onBypass).toHaveBeenCalledOnce();
        });

        test('infrastructure error (500xxx) calls onError and onBypass', () => {
            const onError = vi.fn();
            const onBypass = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} onBypass={onBypass} />);

            capturedOptions!['error-callback']('500100');

            expect(onError).toHaveBeenCalledWith('500100', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
            expect(onBypass).toHaveBeenCalledOnce();
        });

        test('second infrastructure error calls onError again but not onBypass a second time', () => {
            const onError = vi.fn();
            const onBypass = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} onBypass={onBypass} />);

            capturedOptions!['error-callback']('200500');
            capturedOptions!['error-callback']('200500');

            expect(onError).toHaveBeenCalledTimes(2);
            expect(onBypass).toHaveBeenCalledOnce();
        });

        // ── Error callback: bot-detection ──────────────────────────────────────

        test('bot-detection error resets widget on errors 1 and 2', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

            capturedOptions!['error-callback']('300010'); // count=1 < 3 → reset
            expect(mockTurnstile.reset).toHaveBeenCalledWith('widget-id-1');

            capturedOptions!['error-callback']('300010'); // count=2 < 3 → reset
            expect(mockTurnstile.reset).toHaveBeenCalledTimes(2);
        });

        test('third bot-detection error exhausts retries and calls onRetryExhausted once', () => {
            const onRetryExhausted = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onRetryExhausted={onRetryExhausted} />);

            capturedOptions!['error-callback']('300010'); // count=1 → reset
            capturedOptions!['error-callback']('300010'); // count=2 → reset
            capturedOptions!['error-callback']('300010'); // count=3 → exhausted

            expect(onRetryExhausted).toHaveBeenCalledOnce();
            expect(onRetryExhausted).toHaveBeenCalledWith('300010', TURNSTILE_ERROR_FAMILY.BOT_DETECTION);
        });

        test('errors after exhaustion do not call onRetryExhausted again', () => {
            const onRetryExhausted = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onRetryExhausted={onRetryExhausted} />);

            capturedOptions!['error-callback']('300010');
            capturedOptions!['error-callback']('300010');
            capturedOptions!['error-callback']('300010'); // exhausted here
            capturedOptions!['error-callback']('300010'); // must NOT call again

            expect(onRetryExhausted).toHaveBeenCalledOnce();
        });

        test('third reset does not happen (reset called exactly 2 times for 3 errors)', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

            capturedOptions!['error-callback']('300010');
            capturedOptions!['error-callback']('300010');
            capturedOptions!['error-callback']('300010'); // exhaust — no reset

            expect(mockTurnstile.reset).toHaveBeenCalledTimes(2);
        });

        // ── expired-callback ───────────────────────────────────────────────────

        test('expired-callback calls onExpire', () => {
            const onExpire = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onExpire={onExpire} />);

            capturedOptions!['expired-callback']();

            expect(onExpire).toHaveBeenCalledOnce();
        });

        // ── timeout-callback ───────────────────────────────────────────────────

        test('timeout-callback calls onTimeout', () => {
            const onTimeout = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onTimeout={onTimeout} />);

            capturedOptions!['timeout-callback']();

            expect(onTimeout).toHaveBeenCalledOnce();
        });

        // ── render() throws ────────────────────────────────────────────────────

        test('render() throw calls onError with "init-error:" prefix and INFRASTRUCTURE family', () => {
            mockTurnstile.render.mockImplementation(() => {
                throw new Error('Widget initialisation failed');
            });
            const onError = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} />);

            expect(onError).toHaveBeenCalledWith(
                'init-error: Widget initialisation failed',
                TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE
            );
        });

        test('render() throw calls onBypass', () => {
            mockTurnstile.render.mockImplementation(() => {
                throw new Error('Widget initialisation failed');
            });
            const onBypass = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onBypass={onBypass} />);

            expect(onBypass).toHaveBeenCalledOnce();
        });

        test('render() throw with non-Error value uses String() in error message', () => {
            mockTurnstile.render.mockImplementation(() => {
                // oxlint-disable-next-line @typescript-eslint/only-throw-error -- assert String() path for non-Error throws
                throw 'raw string error';
            });
            const onError = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} />);

            expect(onError).toHaveBeenCalledWith('init-error: raw string error', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
        });

        test('catch block skips console.warn when hasLoggedErrorRef is already set by a prior error', () => {
            // After an error-callback sets hasLoggedErrorRef=true, a re-render that causes
            // render() to throw should call onError but NOT call console.warn a second time.
            const onError = vi.fn();
            const { rerender } = render(
                <TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} />
            );

            // First error-callback sets hasLoggedErrorRef = true
            capturedOptions!['error-callback']('200500');
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

            // Configure render() to throw on its next call (happens in re-render's new effect)
            mockTurnstile.render.mockImplementation(() => {
                throw new Error('second-init-fail');
            });

            // Re-render with changed onSuccess — triggers cleanup + new effect where render() throws
            rerender(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} />);

            // Catch block must call onError but NOT console.warn (hasLoggedErrorRef already true)
            expect(onError).toHaveBeenCalledWith('init-error: second-init-fail', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
            expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // still only the original warn
        });
    });

    // ── Optional callbacks — no throw when undefined ───────────────────────────

    describe('optional callbacks do not throw when undefined', () => {
        beforeEach(() => {
            installTurnstile();
        });

        test('no throw when onBypass is undefined on infrastructure error', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);
            expect(() => capturedOptions!['error-callback']('200500')).not.toThrow();
        });

        test('no throw when onError is undefined on infrastructure error', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);
            expect(() => capturedOptions!['error-callback']('200500')).not.toThrow();
        });

        test('no throw when onExpire is undefined', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);
            expect(() => capturedOptions!['expired-callback']()).not.toThrow();
        });

        test('no throw when onTimeout is undefined', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);
            expect(() => capturedOptions!['timeout-callback']()).not.toThrow();
        });

        test('no throw when onRetryExhausted is undefined after retry cap reached', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);
            expect(() => {
                capturedOptions!['error-callback']('300010');
                capturedOptions!['error-callback']('300010');
                capturedOptions!['error-callback']('300010');
            }).not.toThrow();
        });
    });

    // ── resetRef / executeRef ─────────────────────────────────────────────────

    describe('resetRef', () => {
        beforeEach(() => {
            installTurnstile();
        });

        test('resetRef.current is a function after mount', () => {
            const resetRef = { current: null as (() => void) | null };
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} resetRef={resetRef} />);
            expect(typeof resetRef.current).toBe('function');
        });

        test('calling resetRef.current() calls turnstile.reset with the widget id', () => {
            const resetRef = { current: null as (() => void) | null };
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} resetRef={resetRef} />);

            resetRef.current!();

            expect(mockTurnstile.reset).toHaveBeenCalledWith('widget-id-1');
        });

        test('resetRef.current() is a no-op when widget is not yet initialised', () => {
            // Remove turnstile so the widget never initialises; tests the false branch of
            // `if (widgetIdRef.current && window.turnstile)` inside the reset closure.
            uninstallTurnstile();
            const resetRef = { current: null as (() => void) | null };
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} resetRef={resetRef} />);

            expect(() => resetRef.current!()).not.toThrow();
            expect(mockTurnstile.reset).not.toHaveBeenCalled();
        });

        test('resetRef.current() is a no-op when window.turnstile is removed after init', () => {
            const resetRef = { current: null as (() => void) | null };
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} resetRef={resetRef} />);
            // Widget is init'd (widgetIdRef truthy), then turnstile removed — covers the
            // `window.turnstile` falsy short-circuit inside the reset closure.
            uninstallTurnstile();

            expect(() => resetRef.current!()).not.toThrow();
            expect(mockTurnstile.reset).not.toHaveBeenCalled();
        });

        test('resetRef.current is cleared to null on unmount', () => {
            const resetRef = { current: null as (() => void) | null };
            const { unmount } = render(
                <TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} resetRef={resetRef} />
            );

            unmount();

            expect(resetRef.current).toBeNull();
        });
    });

    describe('executeRef', () => {
        beforeEach(() => {
            installTurnstile();
        });

        test('executeRef.current is a function after mount', () => {
            const executeRef = { current: null as (() => void) | null };
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} executeRef={executeRef} />);
            expect(typeof executeRef.current).toBe('function');
        });

        test('calling executeRef.current() calls turnstile.execute with the widget id', () => {
            const executeRef = { current: null as (() => void) | null };
            render(
                <TurnstileWidget
                    siteKey="my-site-key"
                    onSuccess={vi.fn()}
                    executeRef={executeRef}
                    mode="non-interactive"
                />
            );

            executeRef.current!();

            expect(mockTurnstile.execute).toHaveBeenCalledWith('widget-id-1');
        });

        test('executeRef.current() is a no-op when widget is not yet initialised', () => {
            // Remove turnstile so the widget never initialises; tests the false branch of
            // `if (widgetIdRef.current && window.turnstile)` inside the execute closure.
            uninstallTurnstile();
            const executeRef = { current: null as (() => void) | null };
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} executeRef={executeRef} />);

            expect(() => executeRef.current!()).not.toThrow();
            expect(mockTurnstile.execute).not.toHaveBeenCalled();
        });

        test('executeRef.current() is a no-op when window.turnstile is removed after init', () => {
            const executeRef = { current: null as (() => void) | null };
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} executeRef={executeRef} />);
            // Widget is init'd (widgetIdRef truthy), then turnstile removed — covers the
            // `window.turnstile` falsy short-circuit inside the execute closure.
            uninstallTurnstile();

            expect(() => executeRef.current!()).not.toThrow();
            expect(mockTurnstile.execute).not.toHaveBeenCalled();
        });

        test('executeRef.current is cleared to null on unmount', () => {
            const executeRef = { current: null as (() => void) | null };
            const { unmount } = render(
                <TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} executeRef={executeRef} />
            );

            unmount();

            expect(executeRef.current).toBeNull();
        });
    });

    // ── Cleanup on unmount ─────────────────────────────────────────────────────

    describe('cleanup on unmount', () => {
        test('calls turnstile.remove with the widget id on unmount', () => {
            installTurnstile();
            const { unmount } = render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

            unmount();

            expect(mockTurnstile.remove).toHaveBeenCalledWith('widget-id-1');
        });

        test('does not call turnstile.remove when render() threw and widget was never created', () => {
            mockTurnstile.render.mockImplementation(() => {
                throw new Error('fail');
            });
            installTurnstile();
            const { unmount } = render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

            unmount();

            expect(mockTurnstile.remove).not.toHaveBeenCalled();
        });
    });

    // ── Additional branch-coverage targets ────────────────────────────────────

    describe('error-callback with window.turnstile removed after init', () => {
        test('bot-detection retry reset is skipped when window.turnstile is removed', () => {
            installTurnstile();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

            // Remove turnstile after widget initialised; errorResetCount 1 < 3 but turnstile gone
            uninstallTurnstile();
            capturedOptions!['error-callback']('300010');

            expect(mockTurnstile.reset).not.toHaveBeenCalled();
        });
    });

    // ── Script loading: no existing script, window.turnstile not present ───────

    describe('script loading (window.turnstile absent, no existing script)', () => {
        test('creates a <script id="turnstile-script"> element', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

            const script = document.getElementById('turnstile-script') as HTMLScriptElement | null;
            expect(script).not.toBeNull();
            expect(script!.src).toContain('challenges.cloudflare.com/turnstile/v0/api.js');
            expect(script!.async).toBe(true);
            expect(script!.defer).toBe(true);
        });

        test('script onload installs turnstile and initialises the widget', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

            const script = document.getElementById('turnstile-script') as HTMLScriptElement;
            installTurnstile();
            act(() => {
                script.onload?.(new Event('load'));
            });

            expect(mockTurnstile.render).toHaveBeenCalledOnce();
        });

        test('script onerror calls onError("script-load-failed") and onBypass', () => {
            const onError = vi.fn();
            const onBypass = vi.fn();
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} onBypass={onBypass} />);

            const script = document.getElementById('turnstile-script') as HTMLScriptElement;
            act(() => {
                script.onerror?.(new Event('error'));
            });

            expect(onError).toHaveBeenCalledWith('script-load-failed', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
            expect(onBypass).toHaveBeenCalledOnce();
        });

        test('5s load timeout fires onError("script-load-timeout") and onBypass when widget never appears', () => {
            vi.useFakeTimers();
            try {
                const onError = vi.fn();
                const onBypass = vi.fn();
                render(
                    <TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} onBypass={onBypass} />
                );

                act(() => {
                    vi.advanceTimersByTime(5000);
                });

                expect(onError).toHaveBeenCalledWith('script-load-timeout', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
                expect(onBypass).toHaveBeenCalledOnce();
            } finally {
                vi.useRealTimers();
            }
        });

        test('5s load timeout does not throw when onError is undefined', () => {
            vi.useFakeTimers();
            try {
                render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

                expect(() => {
                    act(() => {
                        vi.advanceTimersByTime(5000);
                    });
                }).not.toThrow();
            } finally {
                vi.useRealTimers();
            }
        });

        test('script onerror does not throw when onError is undefined', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

            const script = document.getElementById('turnstile-script') as HTMLScriptElement;

            expect(() => {
                act(() => {
                    script.onerror?.(new Event('error'));
                });
            }).not.toThrow();
        });

        test('onerror after the 5s timeout already fired: skips clearTimeout and skips console.warn', () => {
            vi.useFakeTimers();
            try {
                const onError = vi.fn();
                render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} />);

                // Fire the 5s timeout first — sets scriptLoadTimeoutId=null and hasLoggedErrorRef=true
                act(() => {
                    vi.advanceTimersByTime(5000);
                });
                expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

                // Fire onerror: scriptLoadTimeoutId is now null (false branch) and
                // hasLoggedErrorRef is already true (false branch) — covers both guards
                const script = document.getElementById('turnstile-script') as HTMLScriptElement;
                act(() => {
                    script.onerror?.(new Event('error'));
                });

                // onError IS still called from onerror even though warn was skipped
                expect(onError).toHaveBeenCalledWith('script-load-failed', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
                // console.warn must NOT have been called a second time
                expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        });

        test('onload after the 5s timeout fired: skips clearTimeout (scriptLoadTimeoutId=null)', () => {
            vi.useFakeTimers();
            try {
                const onBypass = vi.fn();
                render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onBypass={onBypass} />);

                // Fire timeout: sets scriptLoadTimeoutId=null and calls bypass
                act(() => {
                    vi.advanceTimersByTime(5000);
                });
                expect(onBypass).toHaveBeenCalledOnce();

                // Now fire onload: scriptLoadTimeoutId is null → false branch covered;
                // initializeWidget still runs and creates the widget
                const script = document.getElementById('turnstile-script') as HTMLScriptElement;
                installTurnstile();
                act(() => {
                    script.onload?.(new Event('load'));
                });

                expect(mockTurnstile.render).toHaveBeenCalledOnce();
                expect(onBypass).toHaveBeenCalledOnce(); // hasBypassed=true, not called again
            } finally {
                vi.useRealTimers();
            }
        });

        test('initializeWidget guard skips re-initialisation when widget already initialised (covers line 136)', () => {
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

            const script = document.getElementById('turnstile-script') as HTMLScriptElement;
            installTurnstile();

            // First onload: widget initialises normally; widgetIdRef is now set
            act(() => {
                script.onload?.(new Event('load'));
            });
            expect(mockTurnstile.render).toHaveBeenCalledOnce();

            // Second onload: initializeWidget is called again; the guard detects
            // widgetIdRef.current is truthy and returns early at line 136
            act(() => {
                script.onload?.(new Event('load'));
            });

            // render() must NOT have been called a second time
            expect(mockTurnstile.render).toHaveBeenCalledOnce();
        });

        test('initializeWidget guard returns early when window.turnstile is absent at onload time', () => {
            // Fire onload without installing turnstile — exercises the !window.turnstile truthy
            // branch inside initializeWidget's guard (the first sub-condition of the OR).
            render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

            const script = document.getElementById('turnstile-script') as HTMLScriptElement;
            // No installTurnstile() call — window.turnstile is absent
            act(() => {
                script.onload?.(new Event('load'));
            });

            // Guard detected !window.turnstile → returned early, render() not called
            expect(mockTurnstile.render).not.toHaveBeenCalled();
        });

        test('onload before 5s timeout prevents timeout from firing bypass', () => {
            vi.useFakeTimers();
            try {
                const onBypass = vi.fn();
                render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onBypass={onBypass} />);

                const script = document.getElementById('turnstile-script') as HTMLScriptElement;
                installTurnstile();
                act(() => {
                    script.onload?.(new Event('load'));
                });

                // Advance well past the 5s window — timeout must not fire bypass
                act(() => {
                    vi.advanceTimersByTime(6000);
                });

                expect(onBypass).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        });
    });

    // ── Script already in DOM, turnstile not yet ready ─────────────────────────

    describe('script already in DOM but window.turnstile not yet ready', () => {
        beforeEach(() => {
            const script = document.createElement('script');
            script.id = 'turnstile-script';
            document.head.appendChild(script);
        });

        test('polls via setInterval and initialises widget when turnstile appears', () => {
            vi.useFakeTimers();
            try {
                render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

                // Interval fires but turnstile is not ready yet
                act(() => {
                    vi.advanceTimersByTime(100);
                });
                expect(mockTurnstile.render).not.toHaveBeenCalled();

                // Set turnstile, then let the next interval tick fire
                installTurnstile();
                act(() => {
                    vi.advanceTimersByTime(100);
                });

                expect(mockTurnstile.render).toHaveBeenCalledOnce();
            } finally {
                vi.useRealTimers();
            }
        });

        test('5s timeout fires onError and onBypass when turnstile never appears', () => {
            vi.useFakeTimers();
            try {
                const onError = vi.fn();
                const onBypass = vi.fn();
                render(
                    <TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} onBypass={onBypass} />
                );

                act(() => {
                    vi.advanceTimersByTime(5000);
                });

                expect(onError).toHaveBeenCalledWith('script-load-timeout', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
                expect(onBypass).toHaveBeenCalledOnce();
            } finally {
                vi.useRealTimers();
            }
        });

        test('5s timeout does not throw when onError is undefined', () => {
            vi.useFakeTimers();
            try {
                render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

                expect(() => {
                    act(() => {
                        vi.advanceTimersByTime(5000);
                    });
                }).not.toThrow();
            } finally {
                vi.useRealTimers();
            }
        });

        test('interval is cleared after turnstile is detected', () => {
            vi.useFakeTimers();
            const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
            try {
                render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

                installTurnstile();
                act(() => {
                    vi.advanceTimersByTime(100);
                });

                expect(clearIntervalSpy).toHaveBeenCalled();
            } finally {
                clearIntervalSpy.mockRestore();
                vi.useRealTimers();
            }
        });

        test('timeout is cleared on unmount before it fires', () => {
            vi.useFakeTimers();
            const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
            try {
                const { unmount } = render(<TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} />);

                unmount();

                expect(clearTimeoutSpy).toHaveBeenCalled();
            } finally {
                clearTimeoutSpy.mockRestore();
                vi.useRealTimers();
            }
        });

        test('5s timeout skips console.warn when hasLoggedErrorRef already set by prior render() throw', () => {
            // Render() throws in the interval → catch sets hasLoggedErrorRef=true.
            // When the 5s timeout fires, !hasLoggedErrorRef.current is false → warn skipped.
            vi.useFakeTimers();
            try {
                const onError = vi.fn();
                const onBypass = vi.fn();
                render(
                    <TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} onBypass={onBypass} />
                );

                // Tick 1: no turnstile → interval fires, nothing
                act(() => {
                    vi.advanceTimersByTime(100);
                });

                // Make render() throw and install turnstile so the next interval tick
                // calls initializeWidget → render() throws → catch sets hasLoggedErrorRef
                mockTurnstile.render.mockImplementation(() => {
                    throw new Error('interval-render-fail');
                });
                installTurnstile();
                act(() => {
                    vi.advanceTimersByTime(100);
                });

                // Catch block fires: onError + onBypass via triggerBypass
                expect(onError).toHaveBeenCalledWith(
                    'init-error: interval-render-fail',
                    TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE
                );
                expect(onBypass).toHaveBeenCalledOnce();
                expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // catch block warn

                // Advance past 5s: timeout fires. widgetIdRef=null (render threw), but
                // hasLoggedErrorRef=true → the inner if(!hasLoggedErrorRef) false branch fires
                act(() => {
                    vi.advanceTimersByTime(5000);
                });

                // Timeout calls onError with 'script-load-timeout'
                expect(onError).toHaveBeenCalledWith('script-load-timeout', TURNSTILE_ERROR_FAMILY.INFRASTRUCTURE);
                // onBypass still only once (hasBypassedRef=true prevents second call)
                expect(onBypass).toHaveBeenCalledOnce();
                // console.warn NOT called a second time from timeout (hasLoggedErrorRef guard)
                expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        });

        test('5s timeout is a no-op when widget was already initialised via interval', () => {
            vi.useFakeTimers();
            try {
                const onError = vi.fn();
                const onBypass = vi.fn();
                render(
                    <TurnstileWidget siteKey="my-site-key" onSuccess={vi.fn()} onError={onError} onBypass={onBypass} />
                );

                // First tick: turnstile not ready
                act(() => {
                    vi.advanceTimersByTime(100);
                });
                // Install turnstile, second tick: widget init + interval cleared
                installTurnstile();
                act(() => {
                    vi.advanceTimersByTime(100);
                });
                expect(mockTurnstile.render).toHaveBeenCalledOnce();

                // Advance past 5s — widget is init'd, timeout fires but guard skips error/bypass
                act(() => {
                    vi.advanceTimersByTime(5000);
                });

                expect(onError).not.toHaveBeenCalled();
                expect(onBypass).not.toHaveBeenCalled();
            } finally {
                vi.useRealTimers();
            }
        });
    });
});
