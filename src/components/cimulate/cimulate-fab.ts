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

/**
 * Restyles the widget's own minimized launcher (`.cim-widget-minimized-button`) as a solid ~56px sparkles pill
 * with an attention loop (expanded with a sheen on load → collapse → re-expand + sheen → …, ~10s). Hover/focus
 * holds it open; `prefers-reduced-motion: reduce` skips the loop and shows a static labeled pill. The header
 * sparkles button is a separate element and is not touched. Blank labels keep a static icon with the SDK accessible name.
 *
 * Client only. The mark is a same-origin SVG (`/images/cimulate-sparkle.svg`), so no CSP change is needed.
 */

const BUTTON_SELECTOR = '.cim-widget-minimized-button';
const STYLE_ATTR = 'data-cimulate-fab';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const SPARKLE_URL = '/images/cimulate-sparkle.svg';
const UI_STATE_EVENT = 'cimulate:ui-state-update';

/** Attention loop timeline (ms from the start of a collapsed cycle). Total ≈ 10.1s. */
export const FAB_TIMING = {
    /** Sheen on the very first expand (page load), once the pill has opened. */
    firstSheen: 700,
    /** Held expanded before collapsing at the start of the loop. */
    initialHold: 3000,
    expandAfterCollapse: 5200,
    sheenAfterCollapse: 6000,
    restartAfterCollapse: 7100,
} as const;

const FAB_CSS = `
.cim-widget-minimized-container { background: transparent !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; }
${BUTTON_SELECTOR} {
  box-sizing: border-box; position: relative; overflow: hidden; white-space: nowrap; line-height: 1;
  display: inline-flex !important; align-items: center; justify-content: flex-start !important;
  width: auto !important; min-width: 56px !important; max-width: 56px; height: 56px !important;
  padding: 0 14px !important; border-radius: 28px !important;
  background: #000 !important;
  color: #fff;
  font: inherit; font-size: 13px !important; font-weight: 650 !important;
  box-shadow: 0 8px 18px #1011163d, 0 2px 4px #1011162e !important;
  transition: max-width 0.6s cubic-bezier(0.16, 1, 0.3, 1) !important;
  /* The commerce preset pulses and scales its round launcher; the pill has its own motion. */
  animation: none !important; transform: none !important;
}
${BUTTON_SELECTOR}.cc-fab-expanded, ${BUTTON_SELECTOR}:hover, ${BUTTON_SELECTOR}:focus-visible { max-width: 320px; padding-right: 24px !important; }
${BUTTON_SELECTOR}:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }
.cim-widget-minimized-icon, ${BUTTON_SELECTOR} > img { display: none !important; }
${BUTTON_SELECTOR} > svg { position: absolute; z-index: 2; top: -9px; left: -72px; display: block !important; width: 58px !important; height: 74px !important; padding: 0 !important; pointer-events: none; background: linear-gradient(90deg, transparent, #ffffff0f 30%, #ffffff8f 50%, #ffffff0f 70%, transparent); filter: blur(7px); opacity: 0; }
${BUTTON_SELECTOR} > svg > * { display: none; }
${BUTTON_SELECTOR}::before {
  content: ''; position: relative; z-index: 1; display: block; flex: 0 0 36px; width: 36px; height: 36px;
  background-color: currentColor;
  -webkit-mask: url('${SPARKLE_URL}') center / contain no-repeat; mask: url('${SPARKLE_URL}') center / contain no-repeat;
  transform: translateX(-4px) scale(0.6);
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
${BUTTON_SELECTOR}::after {
  content: attr(data-label); position: relative; z-index: 1; display: block; flex: 0 0 auto; margin-left: 0; opacity: 0; transform: translateX(8px);
  transition: margin-left 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
${BUTTON_SELECTOR}.cc-fab-expanded > svg, ${BUTTON_SELECTOR}:hover > svg, ${BUTTON_SELECTOR}:focus-visible > svg { opacity: 0; }
${BUTTON_SELECTOR}.cc-fab-expanded::before, ${BUTTON_SELECTOR}:hover::before, ${BUTTON_SELECTOR}:focus-visible::before { transform: translateX(7px) scale(0.6); }
${BUTTON_SELECTOR}.cc-fab-expanded::after, ${BUTTON_SELECTOR}:hover::after, ${BUTTON_SELECTOR}:focus-visible::after { margin-left: 13px; opacity: 1; transform: translateX(0); }
${BUTTON_SELECTOR}.cc-fab-sheen > svg { animation: cc-fab-sheen 0.6s linear; }
@keyframes cc-fab-sheen {
  0% { opacity: 0; transform: translateX(0) skewX(-13deg); }
  15% { opacity: 1; }
  85% { opacity: 1; transform: translateX(310px) skewX(-13deg); }
  100% { opacity: 0; transform: translateX(310px) skewX(-13deg); }
}
@media (prefers-reduced-motion: reduce) {
  ${BUTTON_SELECTOR}, ${BUTTON_SELECTOR} > svg, ${BUTTON_SELECTOR}::before, ${BUTTON_SELECTOR}::after { animation: none !important; transition: none !important; }
  ${BUTTON_SELECTOR} { max-width: 320px; padding-right: 24px !important; }
  ${BUTTON_SELECTOR}::before { transform: translateX(7px) scale(0.6); }
  ${BUTTON_SELECTOR}::after { margin-left: 13px; opacity: 1; transform: none; }
}
.cim-widget-minimized-container.cim-widget-transcript-unified-card ${BUTTON_SELECTOR} {
  background: var(--cim-widget-primary-color, #1c1d22) !important;
  color: var(--cim-widget-on-primary, #fff);
}
${BUTTON_SELECTOR}:is(:not([data-label]), [data-label=""]) {
  width: 56px !important; max-width: 56px; padding: 0 !important; justify-content: center !important;
  animation: none !important; transition: none !important; transform: none !important;
}
${BUTTON_SELECTOR}:is(:not([data-label]), [data-label=""])::before {
  transform: scale(0.6); animation: none !important; transition: none !important;
}
${BUTTON_SELECTOR}:is(:not([data-label]), [data-label=""])::after,
${BUTTON_SELECTOR}:is(:not([data-label]), [data-label=""]) > svg {
  display: none !important; animation: none !important; transition: none !important;
}`;

function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function isFocusVisible(el: HTMLElement): boolean {
    try {
        return el.matches(':focus-visible');
    } catch {
        return true;
    }
}

/** Drives the expand/collapse/sheen loop for one button. Returns a disposer. */
function runAttentionLoop(button: HTMLElement): () => void {
    let timers: number[] = [];
    let hovered = false;
    let focused = false;

    const clear = (): void => {
        for (const timer of timers) window.clearTimeout(timer);
        timers = [];
    };
    const later = (fn: () => void, delay: number): void => {
        timers.push(window.setTimeout(fn, delay));
    };
    const holdOpen = (): void => {
        clear();
        button.classList.remove('cc-fab-sheen');
        button.classList.add('cc-fab-expanded');
    };
    const closedCycle = (): void => {
        clear();
        button.classList.remove('cc-fab-sheen');
        if (prefersReducedMotion()) {
            button.classList.add('cc-fab-expanded');
            return;
        }
        button.classList.remove('cc-fab-expanded');
        later(() => button.classList.add('cc-fab-expanded'), FAB_TIMING.expandAfterCollapse);
        later(() => button.classList.add('cc-fab-sheen'), FAB_TIMING.sheenAfterCollapse);
        later(() => start(), FAB_TIMING.restartAfterCollapse);
    };
    function start(first = false): void {
        holdOpen();
        if (prefersReducedMotion()) return;
        if (first) later(() => button.classList.add('cc-fab-sheen'), FAB_TIMING.firstSheen);
        later(closedCycle, FAB_TIMING.initialHold);
    }

    const onEnter = (): void => {
        hovered = true;
        holdOpen();
    };
    const onLeave = (): void => {
        hovered = false;
        if (!focused) closedCycle();
    };
    const onFocus = (): void => {
        // The widget focuses the launcher after the panel closes; only keyboard focus should stop the loop.
        if (!isFocusVisible(button)) return;
        focused = true;
        holdOpen();
    };
    const onBlur = (): void => {
        if (!focused) return;
        focused = false;
        if (!hovered) closedCycle();
    };
    button.addEventListener('mouseenter', onEnter);
    button.addEventListener('mouseleave', onLeave);
    button.addEventListener('focus', onFocus);
    button.addEventListener('blur', onBlur);
    start(true);

    return () => {
        clear();
        button.removeEventListener('mouseenter', onEnter);
        button.removeEventListener('mouseleave', onLeave);
        button.removeEventListener('focus', onFocus);
        button.removeEventListener('blur', onBlur);
        button.classList.remove('cc-fab-expanded', 'cc-fab-sheen');
    };
}

/**
 * Waits for the widget's minimized button (it may appear after injection, or be re-created after the
 * panel closes) and decorates each new instance. Returns a cleanup that stops watching and removes all
 * classes, listeners, and the injected style.
 */
export function startSparklesFab(rawLabel?: string, initialOpen = false): () => void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';

    const style = document.createElement('style');
    style.setAttribute(STYLE_ATTR, '');
    style.textContent = FAB_CSS;
    document.head.appendChild(style);

    let current: HTMLElement | null = null;
    let disposeLoop: (() => void) | null = null;
    let restoreAttributes: (() => void) | null = null;

    const decorate = (): void => {
        const button = document.querySelector<HTMLElement>(BUTTON_SELECTOR);
        if (!button || button === current) return;
        disposeLoop?.();
        restoreAttributes?.();
        current = button;
        const attributes = ['data-label', 'aria-label', 'title'] as const;
        const original = attributes.map((name) => button.getAttribute(name));
        restoreAttributes = () => {
            attributes.forEach((name, index) => {
                const value = original[index];
                if (value === null) button.removeAttribute(name);
                else button.setAttribute(name, value);
            });
        };
        button.setAttribute('data-label', label);
        if (label) {
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
            disposeLoop = runAttentionLoop(button);
        }
    };

    // Closing (X) only sets isOpen=false, which renders nothing; minimize so the launcher comes back.
    // Only on an open → closed transition: the widget re-emits isOpen=false while minimizing.
    let wasOpen = initialOpen;
    const onUiState = (event: Event): void => {
        const detail = (event as CustomEvent<{ property?: string; value?: unknown }>).detail;
        if (detail?.property !== 'isOpen') return;
        if (detail.value === true) {
            wasOpen = true;
        } else if (wasOpen) {
            wasOpen = false;
            window.CimulateMessaging?.eventHandlers?.components?.toggleWidgetMinimized?.(true);
        }
    };
    window.addEventListener(UI_STATE_EVENT, onUiState);

    decorate();
    const observer = new MutationObserver(() => {
        if (!current?.isConnected) decorate();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
        window.removeEventListener(UI_STATE_EVENT, onUiState);
        observer.disconnect();
        disposeLoop?.();
        restoreAttributes?.();
        style.remove();
    };
}
