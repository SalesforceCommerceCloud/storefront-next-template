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
 * Desktop page push for the Commerce Client panel: at ≥992px, while the widget is open in `panel`
 * display mode, the panel starts below the visible site header, is capped at half the viewport, and
 * `main`/`footer` are shifted aside so the panel does not cover content. Below 992px it stays an overlay.
 *
 * Client only — call from an effect so SSR output and hydration are untouched.
 */

export const PAGE_PUSH_MIN_WIDTH = 992;
const SETTLE_MS = 300;
const DEFAULT_PANEL_WIDTH = '420px';
const UI_STATE_EVENT = 'cimulate:ui-state-update';
const ACTIVE_ATTR = 'data-cc-panel-open';
const STYLE_ATTR = 'data-cimulate-page-push';
const AT_TOP_ATTR = 'data-cc-panel-at-top';
/** Canonical header is `header.sticky`; the luxury vertical marks its header with `data-slot="site-header"`. */
const HEADER_SELECTOR = 'header.sticky, [data-slot="site-header"]';
const PANEL_WIDTH_PATTERN = /^\d*\.?\d+(px|rem|em|vw)$/;

const PANEL_CSS = `@media (min-width: ${PAGE_PUSH_MIN_WIDTH}px) {
  /* Keep bounce at the top, where the panel moves with the page; prevent detachment at the bottom. */
  html[${ACTIVE_ATTR}]:not([${AT_TOP_ATTR}]) { overscroll-behavior-y: none; }
  html[${ACTIVE_ATTR}] .cim-widget-dialog.bottom-left,
  html[${ACTIVE_ATTR}] .cim-widget-dialog.bottom-right {
    box-sizing: border-box;
    width: var(--cc-panel-push) !important;
  }
  html[${ACTIVE_ATTR}] .cim-widget-dialog.full-height.bottom-left,
  html[${ACTIVE_ATTR}] .cim-widget-dialog.full-height.bottom-right {
    top: var(--cc-panel-top, 0px) !important;
    height: calc(100dvh - var(--cc-panel-top, 0px)) !important;
    /* Below the header (z-50), so a frame of scroll lag tucks the panel's edge under the header, never over it. */
    z-index: 40 !important;
  }
  html[${ACTIVE_ATTR}] .cim-widget-dialog.cim-widget-transcript-unified-card.full-height {
    border-radius: var(--cim-widget-border-radius, 0) !important;
    box-shadow: var(--cim-widget-panel-shadow, none) !important;
  }
  /* At the top of the page, the panel scrolls with the document, so overscroll bounce moves it with the header.
     Same position as fixed while scrollY is 0, so the switch is invisible. */
  html[${ACTIVE_ATTR}][${AT_TOP_ATTR}] .cim-widget-dialog.full-height.bottom-left,
  html[${ACTIVE_ATTR}][${AT_TOP_ATTR}] .cim-widget-dialog.full-height.bottom-right {
    position: absolute !important;
  }
}
/* Matches the widget's own 0.25s ease-out panel slide-in, so the page moves with the panel. */
@media (min-width: ${PAGE_PUSH_MIN_WIDTH}px) and (prefers-reduced-motion: no-preference) {
  main, footer { transition: margin-left 0.25s ease-out, margin-right 0.25s ease-out; }
}`;

export interface PagePushOptions {
    /** Only `panel` pushes the page; other display modes are left alone. */
    displayMode: string;
    /** `cc_widgetPosition`; `bottom-right` pushes from the right, anything else from the left. */
    position: string;
    /** `commerceClientPanelWidth`, e.g. `420px`. */
    panelWidth: string;
    initialOpen: boolean;
    /** `cc_dialogFullHeight`; the panel only tracks the header when it is full height. */
    fullHeight: boolean;
}

interface SavedMargins {
    left: string;
    right: string;
}

function isVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
}

function findHeader(): HTMLElement | null {
    for (const el of document.querySelectorAll<HTMLElement>(HEADER_SELECTOR)) {
        if (isVisible(el)) return el;
    }
    return null;
}

/** Only outermost page regions: descendants already move with their ancestor. */
function findPushTargets(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('main, footer')).filter(
        (el) => !el.parentElement?.closest('main, footer')
    );
}

/**
 * Starts page push. Returns a cleanup that removes every margin, style, and attribute it added.
 * No-op (returns a no-op cleanup) outside the browser or when the display mode is not `panel`.
 */
export function startPagePush(options: PagePushOptions): () => void {
    if (typeof window === 'undefined' || typeof document === 'undefined' || options.displayMode !== 'panel') {
        return () => undefined;
    }

    const panelWidth = PANEL_WIDTH_PATTERN.test(options.panelWidth) ? options.panelWidth : DEFAULT_PANEL_WIDTH;
    const root = document.documentElement;
    const saved = new Map<HTMLElement, SavedMargins>();
    let open = options.initialOpen;
    let position = options.position;
    let styleEl: HTMLStyleElement | null = null;
    let observedHeader: HTMLElement | null = null;
    let frame: number | null = null;
    let settleUntil = 0;
    let lastTop: string | undefined;

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => settle());
    const headerObserver = new MutationObserver(() => settle());
    const bodyObserver = new MutationObserver(() => settle());

    function restoreMargins(): void {
        for (const [el, margins] of saved) {
            el.style.marginLeft = margins.left;
            el.style.marginRight = margins.right;
        }
        saved.clear();
    }

    function observe(header: HTMLElement | null): void {
        if (header === observedHeader) return;
        resizeObserver?.disconnect();
        headerObserver.disconnect();
        observedHeader = header;
        if (!header) return;
        resizeObserver?.observe(header);
        headerObserver.observe(header, { attributes: true, attributeFilter: ['class'], subtree: true });
    }

    function deactivate(): void {
        restoreMargins();
        root.removeAttribute(ACTIVE_ATTR);
        root.removeAttribute(AT_TOP_ATTR);
        root.style.removeProperty('--cc-panel-top');
        root.style.removeProperty('--cc-panel-width');
        root.style.removeProperty('--cc-panel-push');
        lastTop = undefined;
    }

    function update(): void {
        const header = findHeader();
        observe(header);

        if (!open || window.innerWidth < PAGE_PUSH_MIN_WIDTH) {
            deactivate();
            return;
        }

        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.setAttribute(STYLE_ATTR, '');
            styleEl.textContent = PANEL_CSS;
            document.head.appendChild(styleEl);
        }

        const top =
            options.fullHeight && header
                ? Math.round(Math.min(Math.max(header.getBoundingClientRect().bottom, 0), window.innerHeight))
                : 0;
        const topValue = `${top}px`;
        if (topValue !== lastTop) {
            root.style.setProperty('--cc-panel-top', topValue);
            lastTop = topValue;
        }
        root.style.setProperty('--cc-panel-width', panelWidth);
        // Capped width; custom properties accept `min()` everywhere, which margin shorthands do not in every engine.
        root.style.setProperty('--cc-panel-push', `min(${panelWidth}, 50vw)`);
        root.setAttribute(ACTIVE_ATTR, '');
        root.toggleAttribute(AT_TOP_ATTR, window.scrollY <= 0);

        const push = 'var(--cc-panel-push)';
        const fromRight = position === 'bottom-right';
        for (const el of findPushTargets()) {
            let original = saved.get(el);
            if (!original) {
                original = { left: el.style.marginLeft, right: el.style.marginRight };
                saved.set(el, original);
            }
            el.style.marginLeft = fromRight ? original.left : push;
            el.style.marginRight = fromRight ? push : original.right;
        }
    }

    /** The header can animate after a class change or resize, so keep measuring for a short window. */
    function settle(): void {
        settleUntil = Date.now() + SETTLE_MS;
        if (frame !== null) return;
        const tick = (): void => {
            frame = null;
            update();
            if (Date.now() < settleUntil) frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
    }

    const onUiState = (event: Event): void => {
        const detail = (event as CustomEvent<{ property?: string; value?: unknown }>).detail;
        if (!detail) return;
        if (detail.property === 'isOpen') open = Boolean(detail.value);
        else if (detail.property === 'position' && typeof detail.value === 'string') position = detail.value;
        else return;
        settle();
    };

    window.addEventListener(UI_STATE_EVENT, onUiState);
    window.addEventListener('scroll', settle, { passive: true });
    window.addEventListener('resize', settle);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    update();

    return () => {
        window.removeEventListener(UI_STATE_EVENT, onUiState);
        window.removeEventListener('scroll', settle);
        window.removeEventListener('resize', settle);
        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = null;
        resizeObserver?.disconnect();
        headerObserver.disconnect();
        bodyObserver.disconnect();
        deactivate();
        styleEl?.remove();
        styleEl = null;
    };
}
