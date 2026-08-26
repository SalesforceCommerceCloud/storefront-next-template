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

import { createContext, type DataStrategyResult, type MiddlewareFunction } from 'react-router';
import { appConfigContext } from '@salesforce/storefront-next-runtime/config';
import type { AppConfig } from '@/types/config';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

type MarkerType = 'start' | 'end';

interface MarkOptions {
    startTime?: number;
    detail?: string;
}

interface MarkEntry {
    name: string;
    timestamp: number;
    detail?: string;
}

interface MetricEntry {
    name: string;
    duration: number;
    startTime: number;
    endTime: number;
    detail?: string;
}

export const PERFORMANCE_MARKS = {
    // Client-side marks
    clientTotal: 'client.total',
    clientMiddleware: 'client.middleware',

    // Server-side marks
    serverTotal: 'ssr.total',
    serverMiddleware: 'ssr.middleware',

    // Auth-related marks
    authRefreshAccessToken: 'auth.refreshAccessToken',
    authLoginGuestUser: 'auth.loginGuestUser',
    authLoginGuestUserPrivate: 'auth.loginGuestUserPrivate',
    authLoginRegisteredUser: 'auth.loginRegisteredUser',
    authRefreshToken: 'auth.refreshToken',
    authGuestLogin: 'auth.guestLogin',
    authAuthorizePasswordless: 'auth.authorizePasswordless',
    authGetPasswordLessAccessToken: 'auth.getPasswordLessAccessToken',
    authGetPasswordResetToken: 'auth.getPasswordResetToken',
    authRequestOtp: 'auth.requestOtp',
    authVerifyOtp: 'auth.verifyOtp',
    authResetPasswordWithToken: 'auth.resetPasswordWithToken',

    // API Call helpers - generate dynamic performance mark names
    apiCall: {
        /**
         * Generate a standardized performance mark name for API calls
         * @param className - The SDK client class name (e.g., 'ShopperProducts', 'ShopperBasketsV2')
         * @param methodName - The method name (e.g., 'getProduct', 'addItemToBasket')
         * @returns Standardized performance mark name
         */
        create: ({ className, methodName }: { className: string; methodName: string }): string =>
            `apiCall.${className}.${methodName}`,
    },
} as const;

let sfdcPerformanceMetricsReported = false;

/**
 * This is an internal class that is responsible for measuring server side performance.
 * This class is taken from PWA Kit and modified to fit our needs
 *
 * This class manages two types of performance marks: start and end.
 *
 * @private
 */
export class PerformanceTimer {
    private readonly MARKER_TYPES: { START: MarkerType; END: MarkerType } = {
        START: 'start',
        END: 'end',
    } as const;

    private readonly enabled: boolean;
    private readonly requestId: string;
    private readonly requestUrl: string;

    public readonly marks: { start: Map<string, MarkEntry>; end: Map<string, MarkEntry> };
    public readonly metrics: MetricEntry[];
    public readonly pendingOperations: Set<Promise<unknown>>;

    constructor(
        options: {
            enabled?: boolean;
            requestId?: string;
            requestUrl?: string;
        } = {}
    ) {
        this.enabled = options.enabled ?? false;
        this.requestId = options.requestId ?? `unknown-${Date.now()}`;
        this.requestUrl = options.requestUrl ?? 'unknown-url';
        this.marks = {
            start: new Map<string, MarkEntry>(),
            end: new Map<string, MarkEntry>(),
        };
        this.metrics = [] as MetricEntry[];
        this.pendingOperations = new Set<Promise<unknown>>();
    }

    /**
     * Track a pending operation (like an API call)
     * so we can wait for it to complete before logging the metrics
     */
    trackOperation(promise: Promise<unknown>): void {
        if (!this.enabled) return;

        this.pendingOperations.add(promise);

        // Remove from pending set when promise resolves/rejects
        // Note: Using finally → catch order (not catch → finally) to handle rejections
        // from both the original promise AND any errors from the cleanup code
        void promise
            .finally(() => {
                this.pendingOperations.delete(promise);
            })
            .catch(() => {
                // This prevents unhandled promise rejection warnings
            });
    }

    /**
     * Wait for all pending operations to complete
     */
    async waitForPendingOperations(): Promise<void> {
        if (!this.enabled || this.pendingOperations.size === 0) return;
        await Promise.allSettled(Array.from(this.pendingOperations));
    }

    /**
     * Set up async completion callback that fires when all pending operations complete
     * This is non-blocking and allows the middleware to return immediately
     */
    setupAsyncCompletion(callback: () => void): void {
        if (!this.enabled || this.pendingOperations.size === 0) {
            // No pending operations, call callback immediately
            callback();
            return;
        }

        // Use Promise.allSettled to wait for all operations without blocking
        Promise.allSettled(Array.from(this.pendingOperations))
            .then(() => {
                callback();
            })
            .catch((error) => {
                logger.error('Error in async completion', {
                    error: error instanceof Error ? error.message : String(error),
                });
                // Still call callback even if there's an error
                callback();
            });
    }

    /**
     * This is a utility function to build the Server-Timing header.
     * The function receives an array of performance metrics and returns a string that represents the Server-Timing header.
     *
     * see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing
     *
     * @function
     * @private
     *
     * @return {String}
     */
    buildServerTimingHeader(): string {
        return this.metrics
            .map((metric) => {
                return `${metric.name};dur=${metric.duration.toFixed(2)}`;
            })
            .join(', ');
    }

    /**
     * A utility function to format and log performance metrics grouped by request.
     * This provides better readability and request context with a visual timeline.
     *
     * @function
     * @private
     */
    log(): void {
        if (this.metrics.length === 0) {
            logger.info(`[perf] No metrics to log for request ${this.requestId}`);
            return;
        }

        // Get the earliest start time and latest end time for timeline calculation
        const minStartTime = Math.min(...this.metrics.map((m) => m.startTime));
        const maxEndTime = Math.max(...this.metrics.map((m) => m.endTime));
        const totalDuration = maxEndTime - minStartTime;

        // Generate timeline visualization
        logger.info('');
        logger.info('═'.repeat(120));
        logger.info(`🚀 Request ${this.requestId}`);
        logger.info(`📍 ${this.requestUrl}`);
        logger.info(`⏱️ ${totalDuration.toFixed(2)}ms`);
        logger.info(
            '⚠️  SSR timing shows total processing time. With streaming enabled, UI renders progressively before completion.'
        );
        logger.info('═'.repeat(120));
        logger.info('');

        // Print column headers
        const nameColHeader = 'Name'.padEnd(42);
        const durationColHeader = 'Duration'.padStart(10);
        const timelineHeader = 'Timeline';
        logger.info(`${nameColHeader}${durationColHeader}    ${timelineHeader}`);
        logger.info('─'.repeat(120));

        // Print timeline header
        const timelineWidth = 80;
        const timeScale = totalDuration / timelineWidth;
        const timeMarkers = [];
        for (let i = 0; i <= 5; i++) {
            const timeAtMarker = (totalDuration * i) / 5;
            timeMarkers.push(`${timeAtMarker.toFixed(0)}ms`);
        }
        logger.info(`${''.padEnd(52)} ${timeMarkers.join(''.padEnd(12))}`);
        logger.info('');

        // Print each metric with its timeline
        const categoryIcons: Record<string, string> = {
            auth: '🔐',
            apiCall: '🌐',
            ssr: '🚀',
            client: '💻',
        };

        // Sort metrics by start time for better visualization
        const sortedMetrics = [...this.metrics].sort((a, b) => a.startTime - b.startTime);

        sortedMetrics.forEach((metric) => {
            const category = metric.name.split('.')[0];
            const icon = categoryIcons[category] || '📊';

            // Calculate timeline bar using relative times
            const relativeStart = metric.startTime - minStartTime;
            const startPos = Math.floor(relativeStart / timeScale);
            const barLength = Math.max(1, Math.floor(metric.duration / timeScale));

            const beforeBar = '░'.repeat(startPos);
            const bar = '▓'.repeat(barLength);
            const afterBar = '░'.repeat(Math.max(0, timelineWidth - startPos - barLength));

            const timeline = beforeBar + bar + afterBar;
            const detail = metric.detail ? ` (${metric.detail})` : '';
            const relativeEnd = relativeStart + metric.duration;
            const timeRange = `${relativeStart.toFixed(0)}→${relativeEnd.toFixed(0)}ms`;

            // Format with proper alignment: icon + name (40 chars) + duration (right-aligned in 10 chars)
            const nameCol = `${icon} ${metric.name}`.padEnd(42); // icon + space + name
            const durationCol = `${metric.duration.toFixed(2)}ms`.padStart(10);

            logger.info(`${nameCol}${durationCol} ${timeline} ${timeRange}${detail}`);
        });

        logger.info('─'.repeat(120));
        logger.info('');

        // Calculate summary statistics
        const sumOfAllOperations = this.metrics.reduce((sum, m) => sum + m.duration, 0);
        const parallelization =
            totalDuration > 0 ? ((sumOfAllOperations - totalDuration) / sumOfAllOperations) * 100 : 0;

        // Group metrics by category
        const categoryStats: Record<string, { count: number; total: number; avg: number }> = {};
        sortedMetrics.forEach((metric) => {
            const category = metric.name.split('.')[0].toUpperCase();
            if (!categoryStats[category]) {
                categoryStats[category] = { count: 0, total: 0, avg: 0 };
            }
            categoryStats[category].count++;
            categoryStats[category].total += metric.duration;
        });

        // Calculate averages
        Object.keys(categoryStats).forEach((category) => {
            categoryStats[category].avg = categoryStats[category].total / categoryStats[category].count;
        });

        const categoryIconsUppercase: Record<string, string> = {
            AUTH: '🔐',
            APICALL: '🌐',
            SSR: '🚀',
            CLIENT: '💻',
        };

        // Print summary
        logger.info('📊 Summary:');
        logger.info(`   Total Operations: ${this.metrics.length}`);
        logger.info(`   Total Duration: ${totalDuration.toFixed(2)}ms`);
        logger.info(`   Sum of All Operations: ${sumOfAllOperations.toFixed(2)}ms`);
        logger.info(`   Parallelization: ${parallelization.toFixed(1)}%`);
        logger.info('');
        logger.info('📈 Breakdown by Category:');
        Object.keys(categoryStats).forEach((category) => {
            const stats = categoryStats[category];
            const icon = categoryIconsUppercase[category] || '📊';
            logger.info(
                `   ${icon} ${category}: ${stats.count} ops, ${stats.total.toFixed(2)}ms total, ${stats.avg.toFixed(2)}ms avg`
            );
        });
        logger.info('');
        logger.info('═'.repeat(120));
    }

    /**
     * This is a utility function to create performance marks.
     * The data will be used in console logs and the http response header `server-timing`.
     *
     * @function
     * @private
     */
    mark(name: string, type: MarkerType, options: MarkOptions = {}): void {
        if (!this.enabled) {
            return;
        }

        if (!name) {
            logger.warn('Performance mark cannot be created because the name is undefined.');
            return;
        }

        if (type !== this.MARKER_TYPES.START && type !== this.MARKER_TYPES.END) {
            logger.warn('Performance mark cannot be created because the type must be either "start" or "end".');
            return;
        }

        const timestamp = options?.startTime ?? performance.now();
        const isEnd = type === this.MARKER_TYPES.END;
        const storage = isEnd ? this.marks.end : this.marks.start;
        storage.set(name, {
            name,
            timestamp,
            detail: options.detail,
        });

        if (isEnd) {
            const startMark = this.marks.start.get(name);
            if (startMark) {
                const measurement: MetricEntry = {
                    name,
                    duration: timestamp - startMark.timestamp,
                    startTime: startMark.timestamp,
                    endTime: timestamp,
                    detail: options.detail,
                };
                this.metrics.push(measurement);
            }
        }
    }
}

export const performanceTimerContext = createContext<PerformanceTimer | undefined>();

/**
 * This is a middleware that measures server side performance.
 *
 * It can be enabled by setting the `config.performance.metrics.serverPerformanceMetricsEnabled` flag to `true`.
 *
 * It currently measures the time it takes to do the following:
 * - Server side rendering process
 * - Server side API calls
 * - Server side authentication operations
 * - Server side middleware operations
 */
export const performanceMetricsMiddlewareServer: MiddlewareFunction<Response> = async ({ request, context }, next) => {
    const config = context.get(appConfigContext) as AppConfig | undefined;
    const enabled = config?.performance?.metrics?.serverPerformanceMetricsEnabled ?? false;
    const serverTimingHeaderEnabled = config?.performance?.metrics?.serverTimingHeaderEnabled ?? false;

    const performanceTimer = new PerformanceTimer({
        enabled,
        requestId: `server-${Date.now()}`,
        requestUrl: new URL(request.url).pathname,
    });
    // Always set the performance timer in context, even when disabled
    context.set(performanceTimerContext, performanceTimer);

    if (!enabled) {
        return next();
    }

    // Start timing the total SSR process
    performanceTimer.mark(PERFORMANCE_MARKS.serverTotal, 'start');
    performanceTimer.mark(PERFORMANCE_MARKS.serverMiddleware, 'start');

    try {
        // Execute the next middleware/handler (this includes loaders, actions, and rendering)
        const response = await next();
        performanceTimer.mark(PERFORMANCE_MARKS.serverMiddleware, 'end');

        if (serverTimingHeaderEnabled) {
            // NOTE: this blocks the thread, should only be used for development
            await performanceTimer.waitForPendingOperations();
            performanceTimer.mark(PERFORMANCE_MARKS.serverTotal, 'end');
            performanceTimer.log();
            response.headers.set('Server-Timing', performanceTimer.buildServerTimingHeader());
        } else {
            // Set up async completion callback - don't block the thread!
            performanceTimer.setupAsyncCompletion(() => {
                performanceTimer.mark(PERFORMANCE_MARKS.serverTotal, 'end');
                performanceTimer.log();
            });
        }

        return response;
    } catch (error) {
        // End timing even on error
        performanceTimer.mark(PERFORMANCE_MARKS.serverMiddleware, 'end');
        performanceTimer.mark(PERFORMANCE_MARKS.serverTotal, 'end', {
            detail: `[perf] SSR failed: ${(error as Error)?.message || 'Unknown error'}`,
        });
        performanceTimer.log();
        throw error;
    }
};

/**
 * This is a middleware that measures client side performance.
 *
 * It can be enabled by setting the `config.performance.metrics.clientPerformanceMetricsEnabled` flag to `true`.
 *
 * It currently measures the time it takes to do the following:
 * - Client side total time to fulfill the requests
 * - Client side API calls
 * - Client side authentication operations
 * - Client side middleware operations
 */
export const performanceMetricsMiddlewareClient: MiddlewareFunction<Record<string, DataStrategyResult>> = async (
    { context },
    next
) => {
    const config = context.get(appConfigContext) as AppConfig | undefined;
    const enabled = config?.performance?.metrics?.clientPerformanceMetricsEnabled ?? false;

    // Create performance timer for client-side operations
    const performanceTimer = new PerformanceTimer({
        enabled,
        requestId: `client-${Date.now()}`,
        requestUrl: typeof window !== 'undefined' ? window.location.pathname : 'client-side',
    });
    // Always set the performance timer in context, even when disabled
    context.set(performanceTimerContext, performanceTimer);

    if (!enabled) {
        return next();
    }

    // Start timing the total client-side process
    performanceTimer.mark(PERFORMANCE_MARKS.clientTotal, 'start');
    performanceTimer.mark(PERFORMANCE_MARKS.clientMiddleware, 'start');

    // **Important:** By default, this client middleware runs **after** the client-side process has already finished its
    // initial render cycle. That's due to how client middleware works in React Router if applied to a component that
    // doesn't also provide a `HydrateFallback` component. That's why we retrieve historical "first-paint" data from the
    // performance API to adjust the start of our "clientTotal" mark accordingly - on initial navigations only.
    if (!sfdcPerformanceMetricsReported) {
        sfdcPerformanceMetricsReported = true;
        const entry = performance.getEntriesByName('first-paint', 'paint').at(0);
        if (entry) {
            performanceTimer.mark(PERFORMANCE_MARKS.clientTotal, 'start', { startTime: entry.startTime });
        }
    }

    try {
        await next();
        performanceTimer.mark(PERFORMANCE_MARKS.clientMiddleware, 'end');

        // Set up async completion callback - don't block the thread!
        performanceTimer.setupAsyncCompletion(() => {
            performanceTimer.mark(PERFORMANCE_MARKS.clientTotal, 'end');
            performanceTimer.log();
        });
    } catch (error) {
        performanceTimer.mark(PERFORMANCE_MARKS.clientMiddleware, 'end');
        performanceTimer.mark(PERFORMANCE_MARKS.clientTotal, 'end', {
            detail: `[perf] Client-side failed: ${(error as Error)?.message || 'Unknown error'}`,
        });
        performanceTimer.log();
        throw error;
    }
};
