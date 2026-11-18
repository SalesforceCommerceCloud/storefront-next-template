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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAB_TIMING, startSparklesFab } from './cimulate-fab';

function mockReducedMotion(reduce: boolean): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }));
}

function addButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'cim-widget-minimized-button';
    document.body.appendChild(button);
    return button;
}

describe('startSparklesFab', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockReducedMotion(false);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
        document.head.innerHTML = '';
    });

    it('labels an existing button via data-label, aria-label and title', () => {
        const button = addButton();
        const stop = startSparklesFab('Ask AI');
        expect(button.getAttribute('data-label')).toBe('Ask AI');
        expect(button.getAttribute('aria-label')).toBe('Ask AI');
        expect(button.getAttribute('title')).toBe('Ask AI');
        stop();
    });

    it('waits for the button to appear', async () => {
        const stop = startSparklesFab('Ask AI');
        const button = addButton();
        await vi.waitFor(() => expect(button.getAttribute('data-label')).toBe('Ask AI'));
        stop();
    });

    it('uses a same-origin SVG mark', () => {
        const stop = startSparklesFab('Ask AI');
        const css = document.head.querySelector('style[data-cimulate-fab]')?.textContent ?? '';
        expect(css).toContain("url('/images/cimulate-sparkle.svg')");
        expect(css).not.toMatch(/https?:\/\//);
        stop();
    });

    it('runs the expand → collapse → re-expand + sheen loop and repeats', () => {
        const button = addButton();
        const stop = startSparklesFab('Ask AI');
        const expanded = () => button.classList.contains('cc-fab-expanded');
        const sheen = () => button.classList.contains('cc-fab-sheen');

        expect(expanded()).toBe(true);
        expect(sheen()).toBe(false);

        // Sheen plays once on the first (page-load) expand.
        vi.advanceTimersByTime(FAB_TIMING.firstSheen);
        expect(sheen()).toBe(true);

        vi.advanceTimersByTime(FAB_TIMING.initialHold - FAB_TIMING.firstSheen);
        expect(expanded()).toBe(false);
        expect(sheen()).toBe(false);

        vi.advanceTimersByTime(FAB_TIMING.expandAfterCollapse);
        expect(expanded()).toBe(true);
        expect(sheen()).toBe(false);

        vi.advanceTimersByTime(FAB_TIMING.sheenAfterCollapse - FAB_TIMING.expandAfterCollapse);
        expect(sheen()).toBe(true);

        // Loop restarts: expanded again, sheen cleared, then collapses once more.
        vi.advanceTimersByTime(FAB_TIMING.restartAfterCollapse - FAB_TIMING.sheenAfterCollapse);
        expect(expanded()).toBe(true);
        expect(sheen()).toBe(false);
        vi.advanceTimersByTime(FAB_TIMING.initialHold);
        expect(expanded()).toBe(false);
        stop();
    });

    it('holds open on hover and focus, and resumes the loop on leave/blur', () => {
        const button = addButton();
        const stop = startSparklesFab('Ask AI');
        vi.advanceTimersByTime(FAB_TIMING.initialHold);
        expect(button.classList.contains('cc-fab-expanded')).toBe(false);

        button.dispatchEvent(new Event('mouseenter'));
        vi.advanceTimersByTime(60_000);
        expect(button.classList.contains('cc-fab-expanded')).toBe(true);

        const matches = button.matches.bind(button);
        vi.spyOn(button, 'matches').mockImplementation((sel) => sel === ':focus-visible' || matches(sel));
        button.dispatchEvent(new Event('focus'));
        button.dispatchEvent(new Event('mouseleave'));
        vi.advanceTimersByTime(60_000);
        expect(button.classList.contains('cc-fab-expanded')).toBe(true); // still focused

        button.dispatchEvent(new Event('blur'));
        expect(button.classList.contains('cc-fab-expanded')).toBe(false);
        vi.advanceTimersByTime(FAB_TIMING.expandAfterCollapse);
        expect(button.classList.contains('cc-fab-expanded')).toBe(true);
        stop();
    });

    it('keeps looping when the widget focuses the launcher programmatically (not keyboard focus)', () => {
        const button = addButton();
        const stop = startSparklesFab('Ask AI');
        vi.advanceTimersByTime(FAB_TIMING.initialHold);
        button.dispatchEvent(new Event('focus'));
        vi.advanceTimersByTime(FAB_TIMING.sheenAfterCollapse);
        expect(button.classList.contains('cc-fab-sheen')).toBe(true);
        button.dispatchEvent(new Event('blur'));
        expect(button.classList.contains('cc-fab-sheen')).toBe(true);
        stop();
    });

    it('prefers-reduced-motion: static labeled pill, no loop', () => {
        mockReducedMotion(true);
        const button = addButton();
        const stop = startSparklesFab('Ask AI');
        expect(button.classList.contains('cc-fab-expanded')).toBe(true);
        expect(button.getAttribute('data-label')).toBe('Ask AI');
        vi.advanceTimersByTime(60_000);
        expect(button.classList.contains('cc-fab-expanded')).toBe(true);
        expect(button.classList.contains('cc-fab-sheen')).toBe(false);
        expect(vi.getTimerCount()).toBe(0);

        // Hover/leave must not start a collapse either.
        button.dispatchEvent(new Event('mouseenter'));
        button.dispatchEvent(new Event('mouseleave'));
        vi.advanceTimersByTime(60_000);
        expect(button.classList.contains('cc-fab-expanded')).toBe(true);
        stop();
    });

    it('re-decorates when the widget re-creates the button', async () => {
        const first = addButton();
        const stop = startSparklesFab('Ask AI');
        first.remove();
        const second = addButton();
        await vi.waitFor(() => expect(second.getAttribute('data-label')).toBe('Ask AI'));
        expect(second.classList.contains('cc-fab-expanded')).toBe(true);
        stop();
    });

    it('cleanup stops timers and removes style and classes', () => {
        const button = addButton();
        const stop = startSparklesFab('Ask AI');
        stop();
        expect(vi.getTimerCount()).toBe(0);
        expect(button.classList.contains('cc-fab-expanded')).toBe(false);
        expect(document.head.querySelector('style[data-cimulate-fab]')).toBeNull();
    });

    it('minimizes on an open → closed transition so the launcher renders', () => {
        const toggleWidgetMinimized = vi.fn();
        window.CimulateMessaging = {
            injectMessagingWidget: vi.fn(),
            eventHandlers: { components: { toggleWidgetMinimized } },
        };
        const emit = (value: boolean): void => {
            window.dispatchEvent(
                new CustomEvent('cimulate:ui-state-update', { detail: { property: 'isOpen', value } })
            );
        };
        const stop = startSparklesFab('Ask AI');

        emit(false);
        expect(toggleWidgetMinimized).not.toHaveBeenCalled();
        emit(true);
        emit(false);
        // The widget re-emits isOpen=false while minimizing; that must not minimize again.
        emit(false);
        expect(toggleWidgetMinimized).toHaveBeenCalledTimes(1);
        expect(toggleWidgetMinimized).toHaveBeenCalledWith(true);

        stop();
        emit(true);
        emit(false);
        expect(toggleWidgetMinimized).toHaveBeenCalledTimes(1);
        delete window.CimulateMessaging;
    });

    it('restores the launcher when initially open without an open event', () => {
        const toggleWidgetMinimized = vi.fn(() => {
            window.dispatchEvent(
                new CustomEvent('cimulate:ui-state-update', { detail: { property: 'isOpen', value: false } })
            );
        });
        window.CimulateMessaging = {
            injectMessagingWidget: vi.fn(),
            eventHandlers: { components: { toggleWidgetMinimized } },
        };
        const stop = startSparklesFab(undefined, true);
        try {
            window.dispatchEvent(
                new CustomEvent('cimulate:ui-state-update', { detail: { property: 'isOpen', value: false } })
            );
            expect(toggleWidgetMinimized).toHaveBeenCalledExactlyOnceWith(true);
        } finally {
            stop();
            delete window.CimulateMessaging;
        }
    });

    it.each([undefined, '', '   '])('keeps a static icon and the SDK accessible name for label %j', (label) => {
        const button = addButton();
        button.setAttribute('aria-label', 'Open assistant');
        const stop = startSparklesFab(label);
        expect(button.getAttribute('data-label')).toBe('');
        expect(button.getAttribute('aria-label')).toBe('Open assistant');
        button.dispatchEvent(new Event('mouseenter'));
        button.dispatchEvent(new Event('focus'));
        vi.advanceTimersByTime(60_000);
        expect(button.classList.contains('cc-fab-expanded')).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        stop();
        expect(button.hasAttribute('data-label')).toBe(false);
        expect(button.getAttribute('aria-label')).toBe('Open assistant');
    });

    it('trims non-empty labels and restores the SDK attributes on cleanup', () => {
        const button = addButton();
        button.setAttribute('aria-label', 'Open assistant');
        const stop = startSparklesFab('  Ask AI  ');
        expect(button.getAttribute('aria-label')).toBe('Ask AI');
        stop();
        expect(button.getAttribute('aria-label')).toBe('Open assistant');
        expect(button.hasAttribute('title')).toBe(false);
    });
});
