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
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CimulateUI from './cimulate-ui';

const mocks = vi.hoisted(() => ({
    navigate: vi.fn(),
    appConfig: { url: { prefix: '/:siteId/:localeId' } },
}));

vi.mock('@/hooks/use-navigate', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@salesforce/storefront-next-runtime/config', () => ({ useConfig: () => mocks.appConfig }));
// Keep the real `buildUrl`, so the rewritten address is the one `Link` would render.
vi.mock('@salesforce/storefront-next-runtime/site-context', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useSite: () => ({ site: { id: 'RefArch' }, locale: { id: 'en-US' } }),
}));
vi.mock('./cimulate-window', () => ({ CimulateWindow: () => null }));

const config = {
    enabled: true,
    commerceClientScriptSourceUrl: 'https://cdn.search.cimulate.ai/copilot-widget/1.43.2/messaging.umd.js',
    scrt2Url: 'https://example.salesforce-scrt.com',
    salesforceOrgId: '00D000000000001',
    esDeveloperName: 'Commerce_Agent',
};

const BACKEND_URL = 'https://backend.example.com/s/RefArch/tie-front-blouse/25589712M.html?lang=en_US';
const CARD = `<div class="cim-widget-msg-product-card">
  <a id="name" href="${BACKEND_URL}" target="_self">Tie Front Blouse</a>
</div>`;
// The slug does not match the name shown, so the product id has to be looked up.
const AMBIGUOUS_CARD = `<div class="cim-widget-msg-product-card">
  <a id="name" href="https://backend.example.com/en_US/cafe-chair-DH-388.html" target="_self">Cozy Chair</a>
</div>`;

/** Lets the MutationObserver deliver its records. */
function flush(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

/** Clicks the card link and reports whether the browser navigation was prevented. */
function clickName(): boolean {
    let prevented = false;
    // `window` runs after `document`, so it sees our listener's result; it then blocks jsdom's navigation.
    const spy = (event: Event) => {
        prevented = event.defaultPrevented;
        event.preventDefault();
    };
    window.addEventListener('click', spy);
    document
        .getElementById('name')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    window.removeEventListener('click', spy);
    return prevented;
}

describe('CimulateUI product-link routing', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        cleanup();
        document.body.innerHTML = '';
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it('points an agent product link at the storefront product page, site and locale included', async () => {
        render(<CimulateUI cimulateConfiguration={config} />);
        document.body.insertAdjacentHTML('beforeend', CARD);
        await flush();

        expect(document.getElementById('name')?.getAttribute('href')).toBe('/RefArch/en-US/p/25589712M');
    });

    it('opens the storefront product page when an agent product link is clicked', () => {
        render(<CimulateUI cimulateConfiguration={config} />);
        document.body.insertAdjacentHTML('beforeend', CARD);

        expect(clickName()).toBe(true);
        // `useNavigate` adds the site and locale prefix, so it gets the bare path.
        expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('/p/25589712M');
    });

    it('still opens it once the link has been pointed at the storefront', async () => {
        render(<CimulateUI cimulateConfiguration={config} />);
        document.body.insertAdjacentHTML('beforeend', CARD);
        await flush();

        expect(clickName()).toBe(true);
        expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('/p/25589712M');
    });

    it('looks up a product id the backend URL does not tell for certain, and points the link at it', async () => {
        fetchMock.mockResolvedValue(Response.json({ productId: 'DH-388' }));
        render(<CimulateUI cimulateConfiguration={config} />);
        document.body.insertAdjacentHTML('beforeend', AMBIGUOUS_CARD);
        await flush();
        await flush();

        expect(fetchMock).toHaveBeenCalledWith(
            '/resource/product-url-mapping?urlSegment=en_US%2Fcafe-chair-DH-388.html',
            expect.anything()
        );
        expect(document.getElementById('name')?.getAttribute('href')).toBe('/RefArch/en-US/p/DH-388');
    });

    it('keeps the backend address when the lookup finds no product', async () => {
        fetchMock.mockImplementation(() => Promise.resolve(Response.json({ productId: null })));
        render(<CimulateUI cimulateConfiguration={config} />);
        document.body.insertAdjacentHTML('beforeend', AMBIGUOUS_CARD);
        await flush();
        await flush();

        expect(fetchMock).toHaveBeenCalledTimes(2); // with and without the locale
        expect(document.getElementById('name')?.getAttribute('href')).toBe(
            'https://backend.example.com/en_US/cafe-chair-DH-388.html'
        );
    });

    it('looks the address up again, the next time the widget draws it, when the lookup failed', async () => {
        fetchMock.mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }));
        fetchMock.mockResolvedValue(Response.json({ productId: 'DH-388' }));
        render(<CimulateUI cimulateConfiguration={config} />);
        document.body.insertAdjacentHTML('beforeend', AMBIGUOUS_CARD);
        await flush();
        await flush();
        expect(document.getElementById('name')?.getAttribute('href')).toBe(
            'https://backend.example.com/en_US/cafe-chair-DH-388.html'
        );
        expect(fetchMock).toHaveBeenCalledTimes(1); // stopped at the failure, not tried without the locale

        document.body.insertAdjacentHTML('beforeend', AMBIGUOUS_CARD.replace('id="name"', 'id="again"'));
        await flush();
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(document.getElementById('again')?.getAttribute('href')).toBe('/RefArch/en-US/p/DH-388');
    });

    it('stops routing once the agent unmounts', () => {
        const { unmount } = render(<CimulateUI cimulateConfiguration={config} />);
        document.body.insertAdjacentHTML('beforeend', CARD);
        unmount();

        expect(clickName()).toBe(false);
        expect(mocks.navigate).not.toHaveBeenCalled();
    });
});
