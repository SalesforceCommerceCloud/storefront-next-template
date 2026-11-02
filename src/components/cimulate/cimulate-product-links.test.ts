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
import {
    attachAgentProductLinkRouting,
    findAgentProductLink,
    getBackendProductId,
    getProductUrlSegments,
} from './cimulate-product-links';

const ORIGIN = 'https://storefront.example.com';
const LOCAL_URL = 'https://backend.example.com/s/RefArch/tie-front-blouse/25589712M.html?lang=en_US';
const PROD_URL = 'https://backend.example.com/s/RefArch/chairs/DH-387.html?lang=en_US';
const SLUG_URL = 'https://backend.example.com/en_US/dipsea-tie-headband-2040793A5H.html';

// Markup copied from what widget 1.43.2 renders for each product slot.
const WIDGET_MARKUP = `
<div id="widget">
  <div class="commerce-client-shopper-agent cim-widget-msg">
    <p><a id="message-link" href="https://help.example.com/returns.html">Returns</a></p>
  </div>
  <div class="commerce-client-shopper-agent cim-widget-msg-product-card">
    <div class="commerce-client-shopper-agent cim-widget-msg-product-card__image-wrapper">
      <a id="card-image" href="${LOCAL_URL}" target="_self" rel="noopener"><img id="card-img" alt="Tie Front Blouse" src="https://img.example.com/a.jpg"></a>
    </div>
    <div class="commerce-client-shopper-agent cim-widget-msg-product-card__content">
      <a id="card-name" class="commerce-client-shopper-agent cim-widget-msg-product-card__title-link" href="${LOCAL_URL}" target="_self" rel="noopener">Tie Front Blouse</a>
      <div class="commerce-client-shopper-agent cim-widget-msg-product-card__description"><a id="card-description-link" href="https://help.example.com/care-guide.html">Care guide</a></div>
    </div>
  </div>
  <div class="commerce-client-shopper-agent cim-widget-msg-pdp">
    <a id="pdp-title" class="commerce-client-shopper-agent cim-widget-msg-pdp__title-link" href="${PROD_URL}" target="_self" rel="noopener noreferrer">Dream Chair</a>
  </div>
  <div class="commerce-client-shopper-agent cim-widget-product-comparison__product-col">
    <a id="comparison-image" href="${PROD_URL}" target="_self" rel="noopener"><img alt="Dream Chair" src="https://img.example.com/b.jpg"></a>
    <a id="comparison-name" class="commerce-client-shopper-agent cim-widget-product-comparison__name-link" href="${PROD_URL}" target="_self" rel="noopener">Dream Chair</a>
  </div>
</div>
<a id="page-link" href="${LOCAL_URL}">Not in the widget</a>`;

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const hrefOf = (id: string) => byId(id).getAttribute('href');
const productHref = (productId: string) => `/us/en-US/p/${productId}`;

/** What Shopper SEO `getUrlMapping` maps each URL segment to in these tests. */
const SEO_PRODUCTS: Record<string, string> = {
    'en_US/dipsea-tie-headband-2040793A5H.html': '2040793A5H',
    'chairs/DH-387.html': 'DH-387',
    'cafe-chair-DH-388.html': 'DH-388',
    't-shirt-123.html': 't-shirt-123',
};

/** Lets the MutationObserver deliver its records and pending lookups answer. */
function flush(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

/** Dispatches a click and returns whether our listener prevented the browser's navigation. */
function click(element: Element, init: MouseEventInit = {}): boolean {
    let prevented = false;
    // `window` runs after `document`, so this sees the result of our listener; it then blocks jsdom's navigation.
    const spy = (event: Event) => {
        prevented = event.defaultPrevented;
        event.preventDefault();
    };
    window.addEventListener('click', spy);
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
    window.removeEventListener('click', spy);
    return prevented;
}

describe('getBackendProductId', () => {
    it.each([
        [LOCAL_URL, '25589712M'],
        ['https://backend.example.com/s/RefArch/x/25589712M.html#reviews', '25589712M'],
        ['https://backend.example.com/s/RefArch/x/25589712M.HTML', '25589712M'],
        ['https://backend.example.com/s/RefArch/x/red%20shoe.html', 'red shoe'],
        ['https://backend.example.com/s/RefArch/Product-Show?pid=DH-387', 'DH-387'],
        [
            'https://backend.example.com/on/demandware.store/Sites-RefArch-Site/en_US/Product-Show?pid=25589712M',
            '25589712M',
        ],
    ])('reads the product id from %s', (href, id) => {
        expect(getBackendProductId(href, ORIGIN)).toBe(id);
    });

    it.each([
        ['a name slug and id', SLUG_URL],
        ['an id that has a dash', PROD_URL],
        ['an id made of dashed words', 'https://backend.example.com/t-shirt-123.html'],
        ['a name slug alone', 'https://backend.example.com/en_US/dream-chair.html'],
    ])('gives no id, to look up instead, for a segment with a dash: %s', (_label, href) => {
        expect(getBackendProductId(href, ORIGIN)).toBeUndefined();
    });

    it.each([
        ['a link on the storefront itself', `${ORIGIN}/us/en-US/p/25589712M`],
        ['a same-origin .html link', `${ORIGIN}/legal/terms.html`],
        ['a backend link that is not a product page', 'https://backend.example.com/s/RefArch/cart'],
        ['an empty .html segment', 'https://backend.example.com/s/RefArch/.html'],
        ['a non-http scheme', 'javascript:alert(1);//x.html'],
        ['a malformed percent-escape', 'https://backend.example.com/x/%E0%A4%A.html'],
        ['text that is not a URL', 'not a url'],
    ])('ignores %s', (_label, href) => {
        expect(getBackendProductId(href, ORIGIN)).toBeUndefined();
    });
});

describe('getProductUrlSegments', () => {
    it.each([
        [SLUG_URL, ['en_US/dipsea-tie-headband-2040793A5H.html', 'dipsea-tie-headband-2040793A5H.html']],
        [PROD_URL, ['chairs/DH-387.html']],
        [
            'https://backend.example.com/s/RefArch/en-GB/caf%C3%A9-chair-1.html',
            ['en-GB/café-chair-1.html', 'café-chair-1.html'],
        ],
        ['https://backend.example.com/dream-chair-1.html', ['dream-chair-1.html']],
    ])('looks %s up as %j', (href, segments) => {
        expect(getProductUrlSegments(href, ORIGIN)).toEqual(segments);
    });

    it.each([
        ['a link on the storefront itself', `${ORIGIN}/x/dream-chair-1.html`],
        ['a link that names the id', 'https://backend.example.com/s/RefArch/Product-Show?pid=DH-387'],
        ['a backend link that is not a product page', 'https://backend.example.com/s/RefArch/cart'],
        ['a malformed percent-escape', 'https://backend.example.com/%E0%A4/x-1.html'],
    ])('looks nothing up for %s', (_label, href) => {
        expect(getProductUrlSegments(href, ORIGIN)).toEqual([]);
    });
});

describe('findAgentProductLink', () => {
    beforeEach(() => {
        document.body.innerHTML = WIDGET_MARKUP;
    });

    it.each([
        'card-image',
        'card-name',
        'pdp-title',
        'comparison-image',
        'comparison-name',
    ])('finds the product link %s', (id) => {
        expect(findAgentProductLink(byId(id))).toBe(byId(id));
    });

    it('finds the link when the click lands on the image inside it', () => {
        expect(findAgentProductLink(byId('card-img'))).toBe(byId('card-image'));
    });

    it.each(['message-link', 'card-description-link', 'page-link'])('ignores %s, which is not a product link', (id) => {
        expect(findAgentProductLink(byId(id))).toBeNull();
    });

    it('ignores a missing target', () => {
        expect(findAgentProductLink(null)).toBeNull();
    });
});

describe('attachAgentProductLinkRouting', () => {
    let navigateToProduct: (productId: string) => void;
    let lookupProductId: ReturnType<typeof vi.fn<(urlSegment: string) => Promise<string | undefined>>>;
    let stop: () => void;

    beforeEach(async () => {
        document.body.innerHTML = WIDGET_MARKUP;
        navigateToProduct = vi.fn();
        lookupProductId = vi.fn((urlSegment: string) => Promise.resolve(SEO_PRODUCTS[urlSegment]));
        stop = attachAgentProductLinkRouting({ navigateToProduct, getProductHref: productHref, lookupProductId });
        await flush(); // the product detail and comparison links (`DH-387`) are looked up
    });

    afterEach(() => {
        stop();
        document.body.innerHTML = '';
    });

    describe('clicks', () => {
        it.each([
            ['card-image', '25589712M'],
            ['card-img', '25589712M'],
            ['card-name', '25589712M'],
            ['pdp-title', 'DH-387'],
            ['comparison-image', 'DH-387'],
            ['comparison-name', 'DH-387'],
        ])('sends a plain click on %s to the product page', (id, productId) => {
            expect(click(byId(id))).toBe(true);
            expect(navigateToProduct).toHaveBeenCalledExactlyOnceWith(productId);
        });

        it.each([
            ['ctrl', { ctrlKey: true }],
            ['cmd', { metaKey: true }],
            ['shift', { shiftKey: true }],
            ['alt', { altKey: true }],
            ['middle button', { button: 1 }],
        ])('leaves a %s click to the browser', (_label, init) => {
            expect(click(byId('card-name'), init)).toBe(false);
            expect(navigateToProduct).not.toHaveBeenCalled();
        });

        it('leaves a link that opens in a new tab to the browser', () => {
            byId('card-name').setAttribute('target', '_blank');
            expect(click(byId('card-name'))).toBe(false);
            expect(navigateToProduct).not.toHaveBeenCalled();
        });

        it('leaves a click another handler already handled', () => {
            document.body.addEventListener('click', (event) => event.preventDefault(), { once: true });
            click(byId('card-name'));
            expect(navigateToProduct).not.toHaveBeenCalled();
        });

        it('ignores links that are not agent product links', () => {
            for (const id of ['message-link', 'card-description-link', 'page-link']) {
                expect(click(byId(id))).toBe(false);
            }
            expect(navigateToProduct).not.toHaveBeenCalled();
        });

        it('ignores a product link that points at another storefront page', () => {
            byId('card-name').setAttribute('href', `${window.location.origin}/us/en-US/cart`);
            expect(click(byId('card-name'))).toBe(false);
            expect(navigateToProduct).not.toHaveBeenCalled();
        });

        it("runs after the widget's own click handler", () => {
            let preventedWhenWidgetRan: boolean | undefined;
            document.body.addEventListener(
                'click',
                (event) => {
                    preventedWhenWidgetRan = event.defaultPrevented;
                },
                { once: true }
            );
            expect(click(byId('card-name'))).toBe(true);
            expect(preventedWhenWidgetRan).toBe(false);
        });

        it('routes a link the widget just pointed at another product, before the rewrite has run', () => {
            byId('card-name').setAttribute('href', PROD_URL);
            expect(click(byId('card-name'))).toBe(true);
            expect(navigateToProduct).toHaveBeenCalledExactlyOnceWith('DH-387');
        });

        it('stops routing once detached', () => {
            stop();
            expect(click(byId('card-name'))).toBe(false);
            expect(navigateToProduct).not.toHaveBeenCalled();
        });
    });

    describe('link addresses', () => {
        it.each([
            ['card-image', '25589712M'],
            ['card-name', '25589712M'],
            ['pdp-title', 'DH-387'],
            ['comparison-image', 'DH-387'],
            ['comparison-name', 'DH-387'],
        ])('points %s at the storefront product page as soon as it attaches', (id, productId) => {
            expect(hrefOf(id)).toBe(`/us/en-US/p/${productId}`);
        });

        it('leaves links that are not agent product links alone', async () => {
            await flush();
            expect(hrefOf('message-link')).toBe('https://help.example.com/returns.html');
            expect(hrefOf('card-description-link')).toBe('https://help.example.com/care-guide.html');
            expect(hrefOf('page-link')).toBe(LOCAL_URL);
        });

        it('points a card the widget draws later at the storefront', async () => {
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg-product-card"><a id="late-card" href="${PROD_URL}">Dream Chair</a></div>`
            );
            await flush();
            expect(hrefOf('late-card')).toBe('/us/en-US/p/DH-387');
        });

        it('points a link added to a card that is already on the page at the storefront', async () => {
            byId('card-name').parentElement?.insertAdjacentHTML(
                'beforeend',
                `<a id="late-link" href="${PROD_URL}">Dream Chair</a>`
            );
            await flush();
            expect(hrefOf('late-link')).toBe('/us/en-US/p/DH-387');
        });

        it('points a product detail title the widget draws later at the storefront', async () => {
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<a id="late-pdp" class="cim-widget-msg-pdp__title-link" href="${PROD_URL}">Dream Chair</a>`
            );
            await flush();
            expect(hrefOf('late-pdp')).toBe('/us/en-US/p/DH-387');
        });

        it('leaves links the widget draws later outside the product slots alone', async () => {
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg"><a id="late-text" href="${PROD_URL}">In text</a></div>
                 <div class="cim-widget-msg-product-card">
                   <div class="cim-widget-msg-product-card__description"><a id="late-description" href="${PROD_URL}">Description</a></div>
                 </div>`
            );
            await flush();
            expect(hrefOf('late-text')).toBe(PROD_URL);
            expect(hrefOf('late-description')).toBe(PROD_URL);
        });

        it('follows a link the widget reuses for another product', async () => {
            byId('card-name').setAttribute('href', PROD_URL);
            await flush();
            expect(hrefOf('card-name')).toBe('/us/en-US/p/DH-387');
        });

        it('settles instead of rewriting forever', async () => {
            const getProductHref = vi.fn(productHref);
            stop();
            stop = attachAgentProductLinkRouting({ navigateToProduct, getProductHref, lookupProductId });

            byId('card-name').setAttribute('href', PROD_URL); // the widget reuses the link
            await flush();
            const callsOnceSettled = getProductHref.mock.calls.length;
            expect(hrefOf('card-name')).toBe('/us/en-US/p/DH-387');

            await flush();
            await flush();
            expect(getProductHref).toHaveBeenCalledTimes(callsOnceSettled);
        });

        it('keeps the storefront address once detached, and leaves links drawn after that alone', async () => {
            stop();
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg-product-card"><a id="after-stop" href="${PROD_URL}">Dream Chair</a></div>`
            );
            await flush();
            expect(hrefOf('card-name')).toBe('/us/en-US/p/25589712M');
            expect(hrefOf('after-stop')).toBe(PROD_URL);
        });

        it('reads the id from the URL without a lookup when it has no dash', () => {
            expect(lookupProductId).not.toHaveBeenCalledWith(expect.stringContaining('tie-front-blouse'));
        });

        it('looks each backend address up once, however many links share it', () => {
            expect(lookupProductId).toHaveBeenCalledExactlyOnceWith('chairs/DH-387.html');
        });

        it('looks up a name slug and id, rather than splitting it by the name shown', async () => {
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg-product-card"><a id="late-slug" class="cim-widget-msg-product-card__title-link" href="${SLUG_URL}">Dipsea Tie Headband</a></div>`
            );
            await flush();
            expect(lookupProductId).toHaveBeenCalledWith('en_US/dipsea-tie-headband-2040793A5H.html');
            expect(hrefOf('late-slug')).toBe('/us/en-US/p/2040793A5H');
        });

        it('looks up an id that has dashes, rather than splitting it', async () => {
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg-product-card"><a id="late-shirt" href="https://backend.example.com/t-shirt-123.html">T-Shirt</a></div>`
            );
            await flush();
            expect(lookupProductId).toHaveBeenCalledWith('t-shirt-123.html');
            expect(hrefOf('late-shirt')).toBe('/us/en-US/p/t-shirt-123');
        });

        it('looks up a card whose name does not match its slug, and points it at the product found', async () => {
            const href = 'https://backend.example.com/cafe-chair-DH-388.html';
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg-product-card"><a id="late-cafe" href="${href}">Cozy Chair</a></div>`
            );
            await flush();
            expect(lookupProductId).toHaveBeenCalledWith('cafe-chair-DH-388.html');
            expect(hrefOf('late-cafe')).toBe('/us/en-US/p/DH-388');
            expect(click(byId('late-cafe'))).toBe(true);
            expect(navigateToProduct).toHaveBeenCalledExactlyOnceWith('DH-388');
        });

        it('tries the path without its locale when the full path is not known', async () => {
            const href = 'https://backend.example.com/en_US/cafe-chair-DH-388.html';
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg-product-card"><a id="late-cafe" href="${href}">Cozy Chair</a></div>`
            );
            await flush();
            expect(lookupProductId).toHaveBeenCalledWith('en_US/cafe-chair-DH-388.html');
            expect(lookupProductId).toHaveBeenCalledWith('cafe-chair-DH-388.html');
            expect(hrefOf('late-cafe')).toBe('/us/en-US/p/DH-388');
        });

        it('leaves a link to the browser while its lookup runs', async () => {
            let answer: (productId: string | undefined) => void = () => {};
            lookupProductId.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        answer = resolve;
                    })
            );
            const href = 'https://backend.example.com/cafe-chair-DH-388.html';
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg-product-card"><a id="late-cafe" href="${href}">Cozy Chair</a></div>`
            );
            await flush();
            expect(click(byId('late-cafe'))).toBe(false);
            expect(hrefOf('late-cafe')).toBe(href);

            answer('DH-388');
            await flush();
            expect(hrefOf('late-cafe')).toBe('/us/en-US/p/DH-388');
        });

        it.each([
            ['finds no product', () => Promise.resolve(undefined)],
            ['fails', () => Promise.reject(new Error('offline'))],
        ])('keeps the backend address, never a storefront 404, when the lookup %s', async (_label, impl) => {
            lookupProductId.mockImplementation(impl);
            const href = 'https://backend.example.com/en_US/cafe-chair-DH-388.html';
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg-product-card"><a id="late-cafe" href="${href}">Cozy Chair</a></div>`
            );
            await flush();
            expect(hrefOf('late-cafe')).toBe(href);
            expect(click(byId('late-cafe'))).toBe(false);
            expect(navigateToProduct).not.toHaveBeenCalled();
        });

        it('does not look up again an address no segment maps to', async () => {
            lookupProductId.mockResolvedValue(undefined);
            const href = 'https://backend.example.com/cafe-chair-DH-388.html';
            const card = `<div class="cim-widget-msg-product-card"><a href="${href}">Cozy Chair</a></div>`;
            byId('widget').insertAdjacentHTML('beforeend', card);
            await flush();
            const callsAfterFirst = lookupProductId.mock.calls.length;

            byId('widget').insertAdjacentHTML('beforeend', card); // the widget draws it again
            await flush();
            expect(lookupProductId).toHaveBeenCalledTimes(callsAfterFirst);
        });

        it('looks up again, the next time the widget draws it, an address whose lookup failed', async () => {
            lookupProductId.mockRejectedValueOnce(new Error('offline'));
            const href = 'https://backend.example.com/cafe-chair-DH-388.html';
            const card = (id: string) =>
                `<div class="cim-widget-msg-product-card"><a id="${id}" href="${href}">Cozy Chair</a></div>`;
            byId('widget').insertAdjacentHTML('beforeend', card('first-try'));
            await flush();
            expect(hrefOf('first-try')).toBe(href);
            expect(lookupProductId).toHaveBeenCalledTimes(2); // `chairs/DH-387.html`, then this one

            byId('widget').insertAdjacentHTML('beforeend', card('second-try'));
            await flush();
            expect(lookupProductId).toHaveBeenCalledTimes(3);
            expect(hrefOf('first-try')).toBe('/us/en-US/p/DH-388');
            expect(hrefOf('second-try')).toBe('/us/en-US/p/DH-388');
        });

        it('stops at the first segment whose lookup fails, so it is retried whole', async () => {
            lookupProductId.mockRejectedValueOnce(new Error('offline'));
            const href = 'https://backend.example.com/en_US/cafe-chair-DH-388.html';
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg-product-card"><a id="late-cafe" href="${href}">Cozy Chair</a></div>`
            );
            await flush();
            expect(lookupProductId).toHaveBeenLastCalledWith('en_US/cafe-chair-DH-388.html');
            expect(lookupProductId).not.toHaveBeenCalledWith('cafe-chair-DH-388.html');
        });

        it('keeps the backend address of an ambiguous link when there is no lookup', () => {
            stop();
            document.body.innerHTML = WIDGET_MARKUP;
            stop = attachAgentProductLinkRouting({ navigateToProduct, getProductHref: productHref });
            expect(hrefOf('card-name')).toBe('/us/en-US/p/25589712M');
            expect(hrefOf('pdp-title')).toBe(PROD_URL);
        });

        it('does not rewrite links once detached, even when a lookup answers later', async () => {
            let answer: (productId: string | undefined) => void = () => {};
            lookupProductId.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        answer = resolve;
                    })
            );
            const href = 'https://backend.example.com/cafe-chair-DH-388.html';
            byId('widget').insertAdjacentHTML(
                'beforeend',
                `<div class="cim-widget-msg-product-card"><a id="late-cafe" href="${href}">Cozy Chair</a></div>`
            );
            await flush();
            stop();
            answer('DH-388');
            await flush();
            expect(hrefOf('late-cafe')).toBe(href);
        });

        it('rewrites links again, and still routes them, when attached with a new address (locale switch)', () => {
            stop();
            stop = attachAgentProductLinkRouting({
                navigateToProduct,
                getProductHref: (productId) => `/fr/fr-FR/p/${productId}`,
            });

            expect(hrefOf('card-name')).toBe('/fr/fr-FR/p/25589712M');
            expect(hrefOf('pdp-title')).toBe('/fr/fr-FR/p/DH-387');
            expect(click(byId('card-name'))).toBe(true);
            expect(navigateToProduct).toHaveBeenCalledExactlyOnceWith('25589712M');
        });
    });
});
