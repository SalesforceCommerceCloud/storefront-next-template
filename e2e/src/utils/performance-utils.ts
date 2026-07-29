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

import type { Page } from '@playwright/test';

export interface WebVitals {
    lcp: number; // Largest Contentful Paint (ms)
    fcp: number; // First Contentful Paint (ms)
    cls: number; // Cumulative Layout Shift (score)
    ttfb: number; // Time to First Byte (ms)
    domContentLoaded: number; // DOM Content Loaded (ms)
    loadComplete: number; // Full page load (ms)
}

export interface LongTask {
    name: string;
    duration: number;
    startTime: number;
}

export interface PerformanceMetrics {
    vitals: WebVitals;
    longTasks: LongTask[];
    resourceCount: {
        scripts: number;
        stylesheets: number;
        images: number;
        fonts: number;
    };
    scriptSize: number;
    documentSize: number;
}

interface LayoutShiftEntry extends PerformanceEntry {
    value: number;
    hadRecentInput: boolean;
}

/**
 * Capture Web Vitals and performance metrics from a page
 */
export async function capturePerformanceMetrics(page: Page): Promise<PerformanceMetrics> {
    const metrics = await page.evaluate(() => {
        // Get navigation timing
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

        // Get paint timing
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find((entry) => entry.name === 'first-contentful-paint')?.startTime || 0;

        // Get LCP from PerformanceObserver (if available)
        let lcp = 0;
        const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as PerformancePaintTiming[];
        if (lcpEntries.length > 0) {
            lcp = lcpEntries[lcpEntries.length - 1].startTime;
        }

        // Get CLS from PerformanceObserver (if available)
        let cls = 0;
        const clsEntries = performance.getEntriesByType('layout-shift') as LayoutShiftEntry[];
        clsEntries.forEach((entry) => {
            if (!entry.hadRecentInput) {
                cls += entry.value;
            }
        });

        // Get long tasks
        const longTasks = performance.getEntriesByType('longtask').map((task) => ({
            name: task.name,
            duration: task.duration,
            startTime: task.startTime,
        }));

        // Get resource counts and sizes
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const scriptSize = resources
            .filter((r) => r.initiatorType === 'script')
            .reduce((acc, r) => acc + (r.transferSize || 0), 0);

        const resourceCount = {
            scripts: resources.filter((r) => r.initiatorType === 'script').length,
            stylesheets: resources.filter((r) => r.initiatorType === 'link' || r.initiatorType === 'css').length,
            images: resources.filter((r) => r.initiatorType === 'img').length,
            fonts: resources.filter((r) => r.name.includes('.woff') || r.name.includes('.ttf')).length,
        };

        const documentSize = navigation.transferSize || 0;

        return {
            vitals: {
                lcp,
                fcp,
                cls,
                ttfb: navigation.responseStart - navigation.requestStart,
                domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
            },
            longTasks,
            resourceCount,
            scriptSize,
            documentSize,
        };
    });

    return metrics;
}

/**
 * Assert Web Vitals are within thresholds
 */
export interface VitalsThresholds {
    lcp?: number; // ms
    fcp?: number; // ms
    cls?: number; // score
    ttfb?: number; // ms
}

export function assertWebVitals(vitals: WebVitals, thresholds: VitalsThresholds): void {
    const failures: string[] = [];

    if (thresholds.lcp && vitals.lcp > thresholds.lcp) {
        failures.push(`LCP ${vitals.lcp.toFixed(0)}ms exceeds threshold ${thresholds.lcp}ms`);
    }
    if (thresholds.fcp && vitals.fcp > thresholds.fcp) {
        failures.push(`FCP ${vitals.fcp.toFixed(0)}ms exceeds threshold ${thresholds.fcp}ms`);
    }
    if (thresholds.cls && vitals.cls > thresholds.cls) {
        failures.push(`CLS ${vitals.cls.toFixed(3)} exceeds threshold ${thresholds.cls}`);
    }
    if (thresholds.ttfb && vitals.ttfb > thresholds.ttfb) {
        failures.push(`TTFB ${vitals.ttfb.toFixed(0)}ms exceeds threshold ${thresholds.ttfb}ms`);
    }

    if (failures.length > 0) {
        throw new Error(`Web Vitals exceeded thresholds:\n  ${failures.join('\n  ')}`);
    }
}

/**
 * Wait for page to be fully loaded and stable
 */
export async function waitForPageStable(page: Page, options?: { timeout?: number }): Promise<void> {
    const timeout = options?.timeout || 30000;

    // Wait for network idle
    await page.waitForLoadState('networkidle', { timeout });

    // Wait for no pending animations
    await page.waitForFunction(
        () => {
            const animations = document.getAnimations();
            return animations.every((anim) => anim.playState === 'finished' || anim.playState === 'idle');
        },
        { timeout }
    );
}

/**
 * Measure operation performance
 */
export async function measureOperation<T>(
    operation: () => Promise<T>,
    label: string
): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await operation();
    const duration = performance.now() - start;

    // oxlint-disable-next-line no-console
    console.log(`[Performance] ${label}: ${duration.toFixed(2)}ms`);

    return { result, duration };
}
