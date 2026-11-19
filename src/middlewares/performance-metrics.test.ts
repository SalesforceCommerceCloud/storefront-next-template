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
import { vi } from 'vitest';
import { createTestContext, type TestContextConfig } from '@/lib/test-utils';
import type { Config } from '@/types/config';
import type { DataStrategyResult, MiddlewareFunction, RouterContext } from 'react-router';

type PerformanceTimerType = typeof import('./performance-metrics').PerformanceTimer;

// Mutable mock config that tests can modify - use vi.hoisted for access in vi.mock
const mockConfig = vi.hoisted(() => {
    return {
        app: {
            performance: {
                metrics: {
                    serverPerformanceMetricsEnabled: false,
                    clientPerformanceMetricsEnabled: false,
                    serverTimingHeaderEnabled: false,
                },
            },
        },
    };
});

// Mock config for middleware tests
vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as Config),
        config: mockConfig,
    };
});

describe('PerformanceTimer', () => {
    let PerformanceTimer: PerformanceTimerType;

    beforeEach(async () => {
        vi.resetModules();
        vi.restoreAllMocks();
        ({ PerformanceTimer } = await vi.importActual('./performance-metrics'));
    });

    test('is disabled by default', () => {
        const timer = new PerformanceTimer();
        timer.mark('test', 'start');
        expect(timer.marks.start.size).toBe(0);
    });

    test('can be enabled', () => {
        const timer = new PerformanceTimer({ enabled: true });
        timer.mark('test', 'start');
        expect(timer.marks.start.size).toBe(1);
    });

    test('marks can be added for both types', () => {
        const timer = new PerformanceTimer({ enabled: true });
        timer.mark('test', 'start');
        timer.mark('test', 'end');
        expect(timer.marks.start.size).toBe(1);
        expect(timer.marks.end.size).toBe(1);
    });

    test('measurements are created when a pair of marks is added', () => {
        const timer = new PerformanceTimer({ enabled: true });
        timer.mark('test', 'start');
        timer.mark('test', 'end');
        expect(timer.metrics).toHaveLength(1);
        expect(timer.metrics[0].name).toBe('test');
        expect(timer.metrics[0].duration).toBeGreaterThan(0);
    });

    describe('trackOperation', () => {
        test('does nothing when disabled', () => {
            const timer = new PerformanceTimer({ enabled: false });
            const promise = Promise.resolve('test');

            // Initially no pending operations
            expect(timer.pendingOperations.size).toBe(0);

            timer.trackOperation(promise);

            // Since it's disabled, pendingOperations should remain empty
            expect(timer.pendingOperations.size).toBe(0);
            expect(timer.pendingOperations.has(promise)).toBe(false);
        });

        test('tracks multiple promises when enabled', async () => {
            const timer = new PerformanceTimer({ enabled: true });

            // Create promises that we can control when they resolve
            let resolvePromise1: ((value: string) => void) | undefined;
            let resolvePromise2: ((value: string) => void) | undefined;
            const promise1 = new Promise<string>((resolve) => {
                resolvePromise1 = resolve;
            });
            const promise2 = new Promise<string>((resolve) => {
                resolvePromise2 = resolve;
            });

            // Initially no pending operations
            expect(timer.pendingOperations.size).toBe(0);

            // Track both operations
            timer.trackOperation(promise1);
            timer.trackOperation(promise2);

            // Both promises should be stored in pending operations
            expect(timer.pendingOperations.size).toBe(2);
            expect(timer.pendingOperations.has(promise1)).toBe(true);
            expect(timer.pendingOperations.has(promise2)).toBe(true);

            // Resolve the first promise
            if (resolvePromise1) {
                resolvePromise1('test1');
            }
            await promise1;

            // Give a small delay for cleanup
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Only first promise should be removed
            expect(timer.pendingOperations.size).toBe(1);
            expect(timer.pendingOperations.has(promise1)).toBe(false);
            expect(timer.pendingOperations.has(promise2)).toBe(true);

            // Resolve the second promise
            if (resolvePromise2) {
                resolvePromise2('test2');
            }
            await promise2;

            // Give a small delay for cleanup
            await new Promise((resolve) => setTimeout(resolve, 10));

            // All promises should be removed
            expect(timer.pendingOperations.size).toBe(0);
            expect(timer.pendingOperations.has(promise2)).toBe(false);
        });

        test('handles rejected promises', async () => {
            const timer = new PerformanceTimer({ enabled: true });

            // Create a promise that will reject and immediately handle it
            const promise = Promise.reject(new Error('test error')).catch(() => {
                // This catch prevents the unhandled rejection warning
                return 'handled';
            });

            timer.trackOperation(promise);

            // Wait for the promise to resolve (it's now handled)
            await promise;

            // Add a small delay to let the internal cleanup finish
            await new Promise((resolve) => setTimeout(resolve, 10));

            expect(timer.metrics).toHaveLength(0);
        });
    });

    describe('waitForPendingOperations', () => {
        test('returns immediately when disabled', async () => {
            const timer = new PerformanceTimer({ enabled: false });
            const promise = new Promise((resolve) => setTimeout(resolve, 100));

            timer.trackOperation(promise);

            const start = Date.now();
            await timer.waitForPendingOperations();
            const duration = Date.now() - start;

            // Should return immediately, not wait for the 100ms promise
            expect(duration).toBeLessThan(50);
        });

        test('returns immediately when no pending operations', async () => {
            const timer = new PerformanceTimer({ enabled: true });

            const start = Date.now();
            await timer.waitForPendingOperations();
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(50);
        });

        test('waits for multiple pending operations', async () => {
            const timer = new PerformanceTimer({ enabled: true });
            let resolved1 = false;
            let resolved2 = false;

            const promise1 = new Promise((resolve) => {
                setTimeout(() => {
                    resolved1 = true;
                    resolve('done1');
                }, 30);
            });

            const promise2 = new Promise((resolve) => {
                setTimeout(() => {
                    resolved2 = true;
                    resolve('done2');
                }, 60);
            });

            timer.trackOperation(promise1);
            timer.trackOperation(promise2);

            expect(resolved1).toBe(false);
            expect(resolved2).toBe(false);

            await timer.waitForPendingOperations();

            expect(resolved1).toBe(true);
            expect(resolved2).toBe(true);
        });

        test('handles rejected operations gracefully', async () => {
            const timer = new PerformanceTimer({ enabled: true });

            // Create a promise that will reject and immediately handle it
            const promise = Promise.reject(new Error('test error')).catch(() => {
                // This catch prevents the unhandled rejection warning
                return 'handled';
            });
            timer.trackOperation(promise);

            // Should not throw even though the tracked promise rejects
            await expect(timer.waitForPendingOperations()).resolves.toBeUndefined();
        });
    });

    describe('setupAsyncCompletion', () => {
        test('calls callback immediately when disabled', async () => {
            const timer = new PerformanceTimer({ enabled: false });
            const promise = new Promise((resolve) => setTimeout(resolve, 100));

            timer.trackOperation(promise);

            const start = Date.now();
            let callbackCalled = false;

            timer.setupAsyncCompletion(() => {
                const duration = Date.now() - start;
                expect(duration).toBeLessThan(50); // Should be immediate
                callbackCalled = true;
            });

            // Give it a moment to ensure the callback was called
            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(callbackCalled).toBe(true);
        });

        test('calls callback immediately when no pending operations', async () => {
            const timer = new PerformanceTimer({ enabled: true });

            const start = Date.now();
            let callbackCalled = false;

            timer.setupAsyncCompletion(() => {
                const duration = Date.now() - start;
                expect(duration).toBeLessThan(10); // Should be immediate
                callbackCalled = true;
            });

            // Give it a moment to ensure the callback was called
            await new Promise((resolve) => setTimeout(resolve, 5));
            expect(callbackCalled).toBe(true);
        });

        test('calls callback after pending operations complete', async () => {
            const timer = new PerformanceTimer({ enabled: true });
            let operationCompleted = false;
            let callbackCalled = false;

            const promise = new Promise((resolve) => {
                setTimeout(() => {
                    operationCompleted = true;
                    resolve('done');
                }, 50);
            });

            timer.trackOperation(promise);

            timer.setupAsyncCompletion(() => {
                expect(operationCompleted).toBe(true);
                callbackCalled = true;
            });

            // Wait for the operation and callback to complete
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(callbackCalled).toBe(true);
        });

        test('calls callback even when operations reject', async () => {
            const timer = new PerformanceTimer({ enabled: true });
            let callbackCalled = false;

            // Create a promise that will reject and immediately handle it
            const promise = Promise.reject(new Error('test error')).catch(() => {
                // This catch prevents the unhandled rejection warning
                return 'handled';
            });
            timer.trackOperation(promise);

            timer.setupAsyncCompletion(() => {
                // Should still be called even though the operation rejected
                callbackCalled = true;
            });

            // Wait for the callback to be called
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(callbackCalled).toBe(true);
        });
    });

    describe('buildServerTimingHeader', () => {
        test('returns empty string when no metrics', () => {
            const timer = new PerformanceTimer({ enabled: true });

            const header = timer.buildServerTimingHeader();

            expect(header).toBe('');
        });

        test('builds header with single metric', () => {
            const timer = new PerformanceTimer({ enabled: true });
            timer.mark('test', 'start');
            timer.mark('test', 'end');

            const header = timer.buildServerTimingHeader();

            expect(header).toMatch(/^test;dur=\d+\.\d{2}$/);
        });

        test('builds header with multiple metrics', () => {
            const timer = new PerformanceTimer({ enabled: true });

            // Create multiple metrics
            timer.mark('operation1', 'start');
            timer.mark('operation1', 'end');
            timer.mark('operation2', 'start');
            timer.mark('operation2', 'end');

            const header = timer.buildServerTimingHeader();

            expect(header).toMatch(/operation1;dur=\d+\.\d{2}, operation2;dur=\d+\.\d{2}/);
        });

        test('omits the password reset token metric but keeps it in the recorded metrics', () => {
            const timer = new PerformanceTimer({ enabled: true });
            timer.mark('operation1', 'start');
            timer.mark('operation1', 'end');
            timer.mark('auth.getPasswordResetToken', 'start');
            timer.mark('auth.getPasswordResetToken', 'end');
            timer.mark('operation2', 'start');
            timer.mark('operation2', 'end');

            const header = timer.buildServerTimingHeader();

            expect(header).not.toContain('getPasswordResetToken');
            expect(header).toMatch(/^operation1;dur=\d+\.\d{2}, operation2;dur=\d+\.\d{2}$/);
            // Still recorded, so the console log keeps it.
            expect(timer.metrics.map((metric) => metric.name)).toContain('auth.getPasswordResetToken');
        });

        test('returns an empty string when the password reset token metric is the only one', () => {
            const timer = new PerformanceTimer({ enabled: true });
            timer.mark('auth.getPasswordResetToken', 'start');
            timer.mark('auth.getPasswordResetToken', 'end');

            expect(timer.buildServerTimingHeader()).toBe('');
        });
    });
});

describe('Performance Metrics Middlewares', () => {
    let PerformanceTimer: PerformanceTimerType;
    let performanceMetricsMiddlewareClient: MiddlewareFunction<Record<string, DataStrategyResult>>;
    let performanceMetricsMiddlewareServer: MiddlewareFunction<Response>;
    let performanceTimerContext: RouterContext<PerformanceTimerType | undefined>;

    beforeEach(async () => {
        vi.resetModules();
        vi.restoreAllMocks();

        mockConfig.app.performance.metrics.serverPerformanceMetricsEnabled = false;
        mockConfig.app.performance.metrics.clientPerformanceMetricsEnabled = false;
        mockConfig.app.performance.metrics.serverTimingHeaderEnabled = false;

        ({
            performanceMetricsMiddlewareClient,
            performanceMetricsMiddlewareServer,
            PerformanceTimer,
            performanceTimerContext,
        } = await vi.importActual('./performance-metrics'));
    });

    describe('performanceMetricsMiddlewareServer', () => {
        test('calls next() immediately when disabled', async () => {
            const mockNext = vi.fn().mockResolvedValue(new Response('test'));
            const mockRequest = { url: 'https://example.com/test' } as Request;
            const mockContext = createTestContext();

            const result = await performanceMetricsMiddlewareServer(
                { request: mockRequest, context: mockContext, params: {}, pattern: '/', url: new URL(mockRequest.url) },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
            expect(result).toBeInstanceOf(Response);
        });

        test('creates performance timer when enabled', async () => {
            // Enable performance metrics
            mockConfig.app.performance.metrics.serverPerformanceMetricsEnabled = true;

            const mockNext = vi.fn().mockResolvedValue(new Response('test'));
            const mockRequest = { url: 'https://example.com/test' } as Request;
            const mockContext = createTestContext();

            // Spy on context.set to verify performance timer is stored
            const setSpy = vi.spyOn(mockContext, 'set');

            const result = await performanceMetricsMiddlewareServer(
                { request: mockRequest, context: mockContext, params: {}, pattern: '/', url: new URL(mockRequest.url) },
                mockNext
            );

            // Verify a PerformanceTimer was created and stored in context
            expect(setSpy).toHaveBeenCalledWith(performanceTimerContext, expect.any(PerformanceTimer));
            expect(mockNext).toHaveBeenCalledOnce();
            expect(result).toBeInstanceOf(Response);
        });

        test('logs performance data when enabled', async () => {
            const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            const mockNext = vi.fn().mockResolvedValue(new Response('test'));
            const mockRequest = { url: 'https://example.com/test' } as Request;
            // Enable performance metrics via appConfig override
            const mockContext = createTestContext({
                appConfig: {
                    performance: {
                        metrics: {
                            serverPerformanceMetricsEnabled: true,
                            clientPerformanceMetricsEnabled: false,
                            serverTimingHeaderEnabled: false,
                        },
                    },
                } as TestContextConfig['appConfig'],
            });

            await performanceMetricsMiddlewareServer(
                { request: mockRequest, context: mockContext, params: {}, pattern: '/', url: new URL(mockRequest.url) },
                mockNext
            );

            // Give time for async completion callback to run
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Verify logging occurred
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('🚀 Request'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('📍'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('═'.repeat(120)));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('📊 Summary:'));
        });

        test('does not put the password reset token duration in the Server-Timing header', async () => {
            // Both flags on is the only combination that emits the header.
            const mockRequest = { url: 'https://example.com/action/request-password-reset' } as Request;
            const mockContext = createTestContext({
                appConfig: {
                    performance: {
                        metrics: {
                            serverPerformanceMetricsEnabled: true,
                            clientPerformanceMetricsEnabled: false,
                            serverTimingHeaderEnabled: true,
                        },
                    },
                } as TestContextConfig['appConfig'],
            });
            // The route marks the SLAS call through the timer the middleware put in context.
            const mockNext = vi.fn().mockImplementation(() => {
                // The file's PerformanceTimerType is the class; the context holds an instance.
                const timer = mockContext.get(performanceTimerContext) as unknown as
                    | InstanceType<PerformanceTimerType>
                    | undefined;
                timer?.mark('auth.getPasswordResetToken', 'start');
                timer?.mark('auth.getPasswordResetToken', 'end');
                timer?.mark('auth.refreshToken', 'start');
                timer?.mark('auth.refreshToken', 'end');
                return Promise.resolve(new Response('ok'));
            });

            const result = await performanceMetricsMiddlewareServer(
                { request: mockRequest, context: mockContext, params: {}, pattern: '/', url: new URL(mockRequest.url) },
                mockNext
            );

            const header = (result as Response).headers.get('Server-Timing') ?? '';
            // The sentinel marks prove the header was emitted, so the absence below is meaningful.
            expect(header).toContain('auth.refreshToken;dur=');
            expect(header).toContain('ssr.total;dur=');
            expect(header).not.toContain('getPasswordResetToken');
        });
    });

    describe('performanceMetricsMiddlewareClient', () => {
        test('calls next() immediately when disabled', async () => {
            const mockNext = vi.fn().mockResolvedValue(undefined);
            const mockContext = createTestContext();

            await performanceMetricsMiddlewareClient(
                {
                    context: mockContext,
                    params: {},
                    request: {} as Request,
                    pattern: '/',
                    url: new URL('http://localhost/'),
                },
                mockNext
            );

            expect(mockNext).toHaveBeenCalledOnce();
        });

        test('creates performance timer when enabled', async () => {
            // Enable performance metrics
            mockConfig.app.performance.metrics.clientPerformanceMetricsEnabled = true;

            const mockNext = vi.fn().mockResolvedValue(undefined);
            const mockContext = createTestContext();

            // Spy on context.set to verify performance timer is stored
            const setSpy = vi.spyOn(mockContext, 'set');

            await performanceMetricsMiddlewareClient(
                {
                    context: mockContext,
                    params: {},
                    request: {} as Request,
                    pattern: '/',
                    url: new URL('http://localhost/'),
                },
                mockNext
            );

            // Verify a PerformanceTimer was created and stored in context
            expect(setSpy).toHaveBeenCalledWith(performanceTimerContext, expect.any(PerformanceTimer));
            expect(mockNext).toHaveBeenCalledOnce();
        });

        test('logs performance data when enabled', async () => {
            const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            const mockNext = vi.fn().mockResolvedValue(undefined);
            // Enable performance metrics via appConfig override
            const mockContext = createTestContext({
                appConfig: {
                    performance: {
                        metrics: {
                            serverPerformanceMetricsEnabled: false,
                            clientPerformanceMetricsEnabled: true,
                            serverTimingHeaderEnabled: false,
                        },
                    },
                } as TestContextConfig['appConfig'],
            });

            await performanceMetricsMiddlewareClient(
                {
                    context: mockContext,
                    params: {},
                    request: {} as Request,
                    pattern: '/',
                    url: new URL('http://localhost/'),
                },
                mockNext
            );

            // Give time for async completion callback to run
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Verify logging occurred
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('🚀 Request'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('📍'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('═'.repeat(120)));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('📊 Summary:'));
        });

        test('adjusts clientTotal mark using first-paint on initial navigation', async () => {
            // Enable performance metrics via appConfig override
            const appConfigOverride = {
                performance: {
                    metrics: {
                        serverPerformanceMetricsEnabled: false,
                        clientPerformanceMetricsEnabled: true,
                        serverTimingHeaderEnabled: false,
                    },
                },
            } as TestContextConfig['appConfig'];

            // Mock performance.entries to include a first-paint entry
            const mockFirstPaintTime = 1000;
            const performanceNowSpy = vi
                .spyOn(performance, 'now')
                .mockReturnValueOnce(1050)
                .mockReturnValueOnce(1100)
                .mockReturnValue(1200);
            const performanceGetEntriesByNameSpy = vi
                .spyOn(performance, 'getEntriesByName')
                .mockImplementation((name) =>
                    name === 'first-paint'
                        ? [
                              {
                                  name: 'first-paint',
                                  entryType: 'paint',
                                  startTime: mockFirstPaintTime,
                                  duration: 0,
                                  toJSON: () => ({}),
                              },
                          ]
                        : []
                );

            const firstNext = vi.fn().mockResolvedValue(undefined);
            const firstContext = createTestContext({ appConfig: appConfigOverride });

            await performanceMetricsMiddlewareClient(
                {
                    context: firstContext,
                    params: {},
                    request: {} as Request,
                    pattern: '/',
                    url: new URL('http://localhost/'),
                },
                firstNext
            );

            expect(performanceGetEntriesByNameSpy).toHaveBeenCalledTimes(1);
            expect(performanceNowSpy).toHaveBeenCalledTimes(4);

            // Get the performance timer from the context
            const firstPerformanceTimer = firstContext.get(
                performanceTimerContext
            ) as unknown as InstanceType<PerformanceTimerType>;
            const firstTotalMark = firstPerformanceTimer.marks.start.get('client.total');

            // Verify the "client.total" mark was adjusted to use first-paint time
            expect(firstTotalMark).toBeDefined();
            expect(firstTotalMark?.timestamp).toBeLessThanOrEqual(performance.now());

            // Give time for async completion callback to run
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(performanceNowSpy).toHaveBeenCalledTimes(5);

            expect(firstPerformanceTimer.metrics).toHaveLength(2);
            const firstMiddlewareMetric = firstPerformanceTimer.metrics.find(
                (metric) => metric.name === 'client.middleware'
            ) as (typeof firstPerformanceTimer.metrics)[0];
            expect(firstMiddlewareMetric).toBeDefined();
            expect(firstMiddlewareMetric.duration).toBe(100);

            const firstTotalMetric = firstPerformanceTimer.metrics.find(
                (metric) => metric.name === 'client.total'
            ) as (typeof firstPerformanceTimer.metrics)[0];
            expect(firstTotalMetric).toBeDefined();
            expect(firstTotalMetric.duration).toBe(200);

            // Invoke the middleware a second time (without a full page reload)
            const secondNext = vi.fn().mockResolvedValue(undefined);
            const secondContext = createTestContext({ appConfig: appConfigOverride });
            await performanceMetricsMiddlewareClient(
                {
                    context: secondContext,
                    params: {},
                    request: {} as Request,
                    pattern: '/',
                    url: new URL('http://localhost/'),
                },
                secondNext
            );

            expect(performanceGetEntriesByNameSpy).toHaveBeenCalledTimes(1); // <-- No second invocation
            expect(performanceNowSpy).toHaveBeenCalledTimes(9);
        });
    });
});
