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
 * Points the Shopper Agent's product links at the Storefront Next product page.
 *
 * The backend sends each product link in the legacy SFRA format on the backend origin, e.g.
 * `https://<instance>.demandware.net/s/RefArch/tie-front-blouse/25589712M.html?lang=en_US`.
 * The widget renders it as a plain `<a href>`, and its `onNavigate` hook only fires for same-origin
 * links, so a click leaves the storefront for a page that does not exist on this head. This module
 * reads the product id from that URL and:
 *
 * - rewrites the link's `href` to the storefront product address, so hover, copy-link,
 *   Cmd/Ctrl-click, middle-click and links set to open in a new tab all use it;
 * - opens the product through the host router on an unmodified, same-tab primary click.
 *
 * When the id cannot be read from the URL with certainty, it is looked up through Shopper SEO
 * `getUrlMapping`, which applies the site's own URL rules. Until the lookup answers, and when it finds
 * no product, the link keeps the backend URL: the shopper lands on the backend product page, never on
 * a storefront 404.
 *
 * Only links in the widget's product slots are touched, never links in agent message text. Those
 * slots are found by the widget's CSS classes (`cim-widget-*`). If a widget release renames them,
 * links keep the backend URL and nothing breaks.
 */

/** Widget markup that holds a product link. */
const PRODUCT_LINK_SCOPES = [
    '.cim-widget-msg-product-card', // carousel card: image and name links
    '.cim-widget-msg-pdp__title-link', // product detail card title (the link itself)
    '.cim-widget-product-comparison__product-col', // comparison column: image and name links
];

/** A link inside a scope, or the scope element when it is the link. */
const PRODUCT_LINK_SELECTOR = PRODUCT_LINK_SCOPES.flatMap((scope) => [`${scope} a[href]`, `a${scope}[href]`]).join(',');

/** Free text inside a card (the description) can hold any link, so it is never touched. */
const FREE_TEXT_SCOPE = '.cim-widget-msg-product-card__description';

/**
 * The URL and its product segment (the `pid` parameter, or the last path segment minus `.html`), or
 * `undefined` when `href` is not a product link on another origin.
 */
function parseBackendProductUrl(
    href: string,
    currentOrigin: string
): { url: URL; segment: string; isProductId: boolean } | undefined {
    let url: URL;
    try {
        url = new URL(href, currentOrigin);
    } catch {
        return undefined;
    }
    // A link on this origin is already routable by the app.
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin === currentOrigin) return undefined;

    const pid = url.searchParams.get('pid'); // `Product-Show?pid=<id>` when URL rules are off
    if (pid) return { url, segment: pid, isProductId: true };

    const lastSegment = url.pathname.split('/').filter(Boolean).at(-1);
    if (!lastSegment || !/\.html$/i.test(lastSegment)) return undefined;
    let segment: string;
    try {
        segment = decodeURIComponent(lastSegment.replace(/\.html$/i, ''));
    } catch {
        return undefined; // malformed percent-escape
    }
    return segment ? { url, segment, isProductId: false } : undefined;
}

/**
 * The product id in a backend product URL, when the URL alone tells it for certain.
 *
 * The id is the `pid` parameter, or the last path segment minus `.html` when that segment has no
 * `-`, i.e. the bare id of `/<slug>/<id>.html`. A segment with a `-` may be the name slug and id
 * joined by `-` (`/<slug>-<id>.html`), or an id that itself contains `-` (`t-shirt-123`); no split
 * tells them apart, so it is ambiguous. Look it up with `getProductUrlSegments` instead.
 *
 * Returns `undefined` when the id is ambiguous or the URL is not a product link on another origin.
 */
export function getBackendProductId(href: string, currentOrigin: string = window.location.origin): string | undefined {
    const parsed = parseBackendProductUrl(href, currentOrigin);
    if (!parsed) return undefined;
    const { segment, isProductId } = parsed;
    return isProductId || !segment.includes('-') ? segment : undefined;
}

/**
 * The URL segments to look a backend product URL up with in Shopper SEO `getUrlMapping`, most likely
 * first: the path without an SFRA `/s/<site>` prefix, then that path without a leading locale. None
 * when `href` is not a backend product link or already names the id.
 */
export function getProductUrlSegments(href: string, currentOrigin: string = window.location.origin): string[] {
    const parsed = parseBackendProductUrl(href, currentOrigin);
    if (!parsed || parsed.isProductId) return [];
    let parts: string[];
    try {
        parts = parsed.url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
        return [];
    }
    if (parts[0] === 's' && parts.length > 2) parts = parts.slice(2);
    const segments = [parts.join('/')];
    if (parts.length > 1 && /^[a-z]{2}([_-][a-z]{2})?$/i.test(parts[0])) {
        segments.push(parts.slice(1).join('/'));
    }
    return segments;
}

function isAgentProductLink(anchor: HTMLAnchorElement): boolean {
    return anchor.matches(PRODUCT_LINK_SELECTOR) && !anchor.closest(FREE_TEXT_SCOPE);
}

/** The widget product link a click landed on, or `null` for any other link. */
export function findAgentProductLink(target: EventTarget | null): HTMLAnchorElement | null {
    if (!(target instanceof Element)) return null;
    const anchor = target.closest('a[href]');
    return anchor instanceof HTMLAnchorElement && isAgentProductLink(anchor) ? anchor : null;
}

/** The widget product links in a subtree, including `node` itself. */
function findAgentProductLinksIn(node: Document | Element): HTMLAnchorElement[] {
    const links = Array.from(node.querySelectorAll<HTMLAnchorElement>(PRODUCT_LINK_SELECTOR));
    if (node instanceof HTMLAnchorElement) links.push(node);
    return links.filter(isAgentProductLink);
}

/**
 * Links rewritten so far, with the id and address written. Lets us tell our own `href` from one the
 * widget set later (it reuses a link for another product), and still route a link we already rewrote.
 */
const rewritten = new WeakMap<HTMLAnchorElement, { productId: string; href: string }>();

/**
 * Starts pointing agent product links at the storefront. Returns a function that stops it; links
 * already rewritten keep their storefront address.
 *
 * A link whose id the URL does not tell for certain is looked up with `lookupProductId`, trying each
 * of `getProductUrlSegments` in turn, and rewritten when the answer comes back if it still has that
 * address. An address no segment maps to is not looked up again; one whose lookup failed is retried
 * the next time the widget draws it. A click before then, or on a link no lookup resolved, is left
 * to the browser.
 *
 * The click listener runs in the bubble phase, after the widget's own click handler, which minimizes
 * the panel on mobile and skips an event that is already `defaultPrevented`.
 *
 * The observer watches the whole document because the widget renders its dialogs outside its own
 * container. It looks at every node added to the page but only changes links in product slots. Its own
 * `href` write triggers one more pass, which finds the address already correct and writes nothing, so
 * it cannot loop.
 */
export function attachAgentProductLinkRouting({
    navigateToProduct,
    getProductHref,
    lookupProductId,
    root = document,
}: {
    /** Opens the product page through the host router. */
    navigateToProduct: (productId: string) => void;
    /** The storefront address of a product page, site and locale prefix included. */
    getProductHref: (productId: string) => string;
    /** The product id a URL segment maps to, or `undefined` when it maps to none; rejects when the lookup fails. */
    lookupProductId?: (urlSegment: string) => Promise<string | undefined>;
    root?: Document;
}): () => void {
    let stopped = false;
    /** Backend address -> product id, or null when it maps to none; set once its lookup answers. */
    const lookedUp = new Map<string, string | null>();
    /** Backend addresses with a lookup in flight. */
    const pending = new Set<string>();

    /** The product a link points at: the one we rewrote it for, else the one its backend address names. */
    const getLinkedProductId = (anchor: HTMLAnchorElement): string | undefined => {
        const own = rewritten.get(anchor);
        if (own && anchor.getAttribute('href') === own.href) return own.productId;
        return getBackendProductId(anchor.href) ?? lookedUp.get(anchor.href) ?? undefined;
    };

    const writeHref = (anchor: HTMLAnchorElement, productId: string): void => {
        const href = getProductHref(productId);
        rewritten.set(anchor, { productId, href });
        if (anchor.getAttribute('href') !== href) anchor.setAttribute('href', href);
    };

    /** Resolves to the product id, or `undefined` when no segment maps to one; rejects when a lookup fails. */
    const lookUp = async (backendHref: string): Promise<string | undefined> => {
        for (const urlSegment of getProductUrlSegments(backendHref)) {
            const productId = await lookupProductId?.(urlSegment);
            if (productId) return productId;
        }
        return undefined;
    };

    const rewrite = (anchor: HTMLAnchorElement): void => {
        const productId = getLinkedProductId(anchor);
        if (productId) {
            writeHref(anchor, productId);
            return;
        }
        const backendHref = anchor.href;
        if (!lookupProductId || lookedUp.has(backendHref) || pending.has(backendHref)) return;
        if (!getProductUrlSegments(backendHref).length) return;
        pending.add(backendHref);
        void lookUp(backendHref).then(
            (foundId) => {
                pending.delete(backendHref);
                lookedUp.set(backendHref, foundId ?? null);
                if (stopped || !foundId) return;
                // Every link still on that address, including ones drawn while the lookup ran
                for (const link of findAgentProductLinksIn(root)) {
                    if (link.href === backendHref) writeHref(link, foundId);
                }
            },
            () => {
                // Offline or a server error: keep the backend URL, and look it up again next time
                pending.delete(backendHref);
            }
        );
    };

    const onClick = (event: MouseEvent): void => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const anchor = findAgentProductLink(event.target);
        if (!anchor || (anchor.target && anchor.target !== '_self')) return;

        const productId = getLinkedProductId(anchor);
        if (!productId) return;

        event.preventDefault();
        navigateToProduct(productId);
    };

    // The widget draws a link with the backend address each time it draws a card, and sets it again
    // when it reuses a link for another product.
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            if (record.type === 'attributes') {
                if (record.target instanceof HTMLAnchorElement && isAgentProductLink(record.target)) {
                    rewrite(record.target);
                }
            } else {
                record.addedNodes.forEach((node) => {
                    if (node instanceof Element) findAgentProductLinksIn(node).forEach(rewrite);
                });
            }
        }
    });

    findAgentProductLinksIn(root).forEach(rewrite);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    root.addEventListener('click', onClick);

    return () => {
        stopped = true;
        observer.disconnect();
        root.removeEventListener('click', onClick);
    };
}
