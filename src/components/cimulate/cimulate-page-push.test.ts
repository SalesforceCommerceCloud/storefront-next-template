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
import { startPagePush, type PagePushOptions } from './cimulate-page-push';

const options: PagePushOptions = {
    displayMode: 'panel',
    position: 'bottom-right',
    panelWidth: '420px',
    initialOpen: false,
    fullHeight: true,
};

function query<T extends HTMLElement = HTMLElement>(selector: string): T {
    const el = document.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element: ${selector}`);
    return el;
}

let frames: FrameRequestCallback[] = [];
let headerBottom = 80;
const disposers: Array<() => void> = [];

/** Starts page push and guarantees cleanup even when an assertion throws first. */
function start(opts: PagePushOptions): () => void {
    const stop = startPagePush(opts);
    disposers.push(stop);
    return stop;
}

/** Runs queued animation frames, advancing the clock `stepMs` per frame, until none are left. */
function flushFrames(stepMs = 100, max = 20): void {
    for (let i = 0; i < max && frames.length > 0; i++) {
        const batch = frames;
        frames = [];
        vi.advanceTimersByTime(stepMs);
        for (const cb of batch) cb(performance.now());
    }
}

function setViewport(width: number): void {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

function emit(property: string, value: unknown): void {
    window.dispatchEvent(new CustomEvent('cimulate:ui-state-update', { detail: { property, value } }));
}

describe('startPagePush', () => {
    let main: HTMLElement;
    let footer: HTMLElement;
    let header: HTMLElement;

    beforeEach(() => {
        vi.useFakeTimers();
        frames = [];
        headerBottom = 80;
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
        vi.stubGlobal('cancelAnimationFrame', () => {
            frames = [];
        });
        setViewport(1280);
        document.body.innerHTML = `
            <header class="sticky top-0"></header>
            <main style="margin-left: 4px"><footer id="inner"></footer></main>
            <footer id="site"></footer>`;
        header = query('header');
        main = query('main');
        footer = query('#site');
        header.getBoundingClientRect = () => ({ bottom: headerBottom, height: headerBottom }) as DOMRect;
    });

    afterEach(() => {
        for (const dispose of disposers.splice(0)) dispose();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        document.body.innerHTML = '';
        document.head.innerHTML = '';
        document.documentElement.removeAttribute('style');
        document.documentElement.removeAttribute('data-cc-panel-open');
        document.documentElement.removeAttribute('data-cc-panel-at-top');
        Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    });

    it('pushes nested main and footer regions only once', () => {
        main.innerHTML = '<main id="nested"><footer id="card-footer"></footer></main>';
        footer.innerHTML = '<footer id="nested-footer"></footer>';
        start({ ...options, initialOpen: true });
        expect(main.style.marginRight).toBe('var(--cc-panel-push)');
        expect(footer.style.marginRight).toBe('var(--cc-panel-push)');
        for (const selector of ['#nested', '#card-footer', '#nested-footer']) {
            expect(query(selector).style.marginRight).toBe('');
        }
    });

    it('does nothing while closed', () => {
        const stop = start(options);
        expect(main.style.marginRight).toBe('');
        expect(document.documentElement.hasAttribute('data-cc-panel-open')).toBe(false);
        stop();
    });

    it('is a no-op outside panel mode', () => {
        const stop = start({ ...options, displayMode: 'dialog', initialOpen: true });
        expect(main.style.marginRight).toBe('');
        stop();
    });

    it('sets --cc-panel-top from the header bottom and pushes main/footer right for bottom-right', () => {
        const stop = start({ ...options, initialOpen: true });
        expect(document.documentElement.style.getPropertyValue('--cc-panel-top')).toBe('80px');
        expect(document.documentElement.style.getPropertyValue('--cc-panel-width')).toBe('420px');
        expect(document.documentElement.style.getPropertyValue('--cc-panel-push')).toBe('min(420px, 50vw)');
        expect(main.style.marginRight).toBe('var(--cc-panel-push)');
        expect(footer.style.marginRight).toBe('var(--cc-panel-push)');
        // Left margin is untouched; nested footers inside <main> are not pushed.
        expect(main.style.marginLeft).toBe('4px');
        expect(query('#inner').style.marginRight).toBe('');
        expect(document.querySelector('style[data-cimulate-page-push]')?.textContent).toContain(
            'width: var(--cc-panel-push)'
        );
        expect(document.querySelector('style[data-cimulate-page-push]')?.textContent).toContain(
            'z-index: 40 !important'
        );
        stop();
    });

    it('pushes from the left for any other position', () => {
        const stop = start({ ...options, position: 'bottom-left', initialOpen: true });
        expect(main.style.marginLeft).toBe('var(--cc-panel-push)');
        expect(main.style.marginRight).toBe('');
        stop();
    });

    it('opens/closes from widget events and restores original margins', () => {
        const stop = start(options);
        emit('isOpen', true);
        flushFrames();
        expect(footer.style.marginRight).toBe('var(--cc-panel-push)');

        emit('isOpen', false);
        flushFrames();
        expect(footer.style.marginRight).toBe('');
        expect(main.style.marginLeft).toBe('4px');
        expect(main.style.marginRight).toBe('');
        expect(document.documentElement.style.getPropertyValue('--cc-panel-top')).toBe('');
        expect(document.documentElement.hasAttribute('data-cc-panel-open')).toBe(false);
        stop();
    });

    it('switches side when the widget position changes', () => {
        const stop = start({ ...options, initialOpen: true });
        emit('position', 'bottom-left');
        flushFrames();
        expect(footer.style.marginLeft).toBe('var(--cc-panel-push)');
        expect(footer.style.marginRight).toBe('');
        stop();
    });

    it('overlays only below 992px and re-evaluates on resize', () => {
        setViewport(800);
        const stop = start({ ...options, initialOpen: true });
        expect(main.style.marginRight).toBe('');

        setViewport(992);
        window.dispatchEvent(new Event('resize'));
        flushFrames();
        expect(main.style.marginRight).toBe('var(--cc-panel-push)');

        setViewport(991);
        window.dispatchEvent(new Event('resize'));
        flushFrames();
        expect(main.style.marginRight).toBe('');
        stop();
    });

    it('tracks the header during the 300ms settle window after a scroll or class change', () => {
        const stop = start({ ...options, initialOpen: true });
        headerBottom = 40;
        window.dispatchEvent(new Event('scroll'));
        flushFrames(100);
        expect(document.documentElement.style.getPropertyValue('--cc-panel-top')).toBe('40px');

        headerBottom = 0; // header animated away
        header.className = 'sticky -translate-y-full';
        // MutationObserver callbacks are microtasks; await them before flushing frames.
        return Promise.resolve().then(() => {
            flushFrames(100);
            expect(document.documentElement.style.getPropertyValue('--cc-panel-top')).toBe('0px');
            stop();
        });
    });

    it('stops measuring after the settle window', () => {
        const stop = start({ ...options, initialOpen: true });
        window.dispatchEvent(new Event('scroll'));
        flushFrames(100, 20);
        expect(frames).toHaveLength(0);
        stop();
    });

    it('uses the luxury header marker and skips hidden headers', () => {
        document.body.innerHTML = `
            <header class="sticky" id="hidden"></header>
            <div data-slot="site-header" id="lux"></div>
            <main></main>`;
        query('#hidden').getBoundingClientRect = () => ({ bottom: 10, height: 0 }) as DOMRect;
        query('#lux').getBoundingClientRect = () => ({ bottom: 120, height: 120 }) as DOMRect;
        const stop = start({ ...options, initialOpen: true });
        expect(document.documentElement.style.getPropertyValue('--cc-panel-top')).toBe('120px');
        stop();
    });

    it('uses 0 when the panel is not full height', () => {
        const stop = start({ ...options, initialOpen: true, fullHeight: false });
        expect(document.documentElement.style.getPropertyValue('--cc-panel-top')).toBe('0px');
        stop();
    });

    it('falls back to the default width for an invalid panelWidth', () => {
        const stop = start({ ...options, initialOpen: true, panelWidth: 'calc(1px; evil' });
        expect(document.documentElement.style.getPropertyValue('--cc-panel-push')).toBe('min(420px, 50vw)');
        stop();
    });

    it('lets the panel scroll with the page only at the top, so overscroll bounce moves it with the header', () => {
        start({ ...options, initialOpen: true });
        expect(document.documentElement.hasAttribute('data-cc-panel-at-top')).toBe(true);
        expect(document.querySelector('style[data-cimulate-page-push]')?.textContent).toMatch(
            /html\[data-cc-panel-open\]\[data-cc-panel-at-top\] \.cim-widget-dialog\.full-height\.bottom-right \{\s*position: absolute !important;/
        );

        Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 });
        window.dispatchEvent(new Event('scroll'));
        flushFrames();
        expect(document.documentElement.hasAttribute('data-cc-panel-at-top')).toBe(false);

        Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
        window.dispatchEvent(new Event('scroll'));
        flushFrames();
        expect(document.documentElement.hasAttribute('data-cc-panel-at-top')).toBe(true);

        emit('isOpen', false);
        flushFrames();
        expect(document.documentElement.hasAttribute('data-cc-panel-at-top')).toBe(false);
    });

    it('cleanup removes margins, style, attribute, vars and listeners', () => {
        const stop = start({ ...options, initialOpen: true });
        stop();
        expect(main.style.marginRight).toBe('');
        expect(main.style.marginLeft).toBe('4px');
        expect(footer.style.marginRight).toBe('');
        expect(document.querySelector('style[data-cimulate-page-push]')).toBeNull();
        expect(document.documentElement.hasAttribute('data-cc-panel-open')).toBe(false);
        emit('isOpen', true);
        flushFrames();
        expect(footer.style.marginRight).toBe('');
    });
});
