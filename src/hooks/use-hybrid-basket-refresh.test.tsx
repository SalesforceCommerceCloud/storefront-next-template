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
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useHybridBasketRefresh } from '@/hooks/use-hybrid-basket-refresh';
import { parseBasketCookie } from '@/lib/basket/cookie';

const mocks = vi.hoisted(() => ({
    load: vi.fn(),
    publish: vi.fn(),
    fetcher: { state: 'idle', data: undefined as unknown },
    navigation: 'idle',
    fetchers: [] as Array<{ key: string; state: string }>,
    site: { site: { id: 'RefArchGlobal' }, locale: { id: 'en-GB' }, currency: 'GBP' },
    auth: { authContextVersion: 'auth1' },
    current: undefined as unknown,
}));
vi.mock('react-router', () => ({
    useFetchers: () => mocks.fetchers,
    useNavigation: () => ({ state: mocks.navigation }),
    useRevalidator: () => ({ state: 'idle' }),
}));
vi.mock('@salesforce/storefront-next-runtime/site-context', () => ({ useSite: () => mocks.site }));
vi.mock('@/providers/auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/providers/basket', () => ({
    useBasket: () => mocks.current,
    useBasketRefreshPublisher: () => mocks.publish,
}));
vi.mock('@/hooks/use-auth-fetcher', () => ({ useAuthFetcher: () => ({ ...mocks.fetcher, load: mocks.load }) }));
const snapshot = (count = 1) => ({
    basketId: 'b1',
    totalItemCount: count,
    uniqueProductCount: count ? 1 : 0,
    lastModified: String(count),
});
const writeCookie = (count = 1) => {
    document.cookie = `__sfdc_basket=${btoa(JSON.stringify(snapshot(count)))}; Path=/`;
};
const flush = () =>
    act(() => {
        vi.runOnlyPendingTimers();
    });
const response = (count = 2) => ({
    success: true,
    basketId: 'b1',
    basket: { basketId: 'b1', productItems: [{ quantity: count }], lastModified: String(count) },
    snapshot: snapshot(count),
    cookie: `__sfdc_basket=${btoa(JSON.stringify(snapshot(count)))}; Path=/`,
});
const onReturn = () =>
    act(() => {
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
    });

describe('hybrid basket entry/return refresh', () => {
    it('coalesces StrictMode mount replay', () => {
        renderHook(useHybridBasketRefresh, { wrapper: StrictMode });
        flush();
        expect(mocks.load).toHaveBeenCalledOnce();
    });
    it('publishes missing-timestamp data once without a reload loop', () => {
        const { rerender } = renderHook(useHybridBasketRefresh);
        flush();
        const result = response(2);
        result.snapshot.lastModified = '';
        result.basket.lastModified = '';
        result.cookie = `__sfdc_basket=${btoa(JSON.stringify(result.snapshot))}; Path=/`;
        mocks.fetcher.data = result;
        rerender();
        flush();
        rerender();
        flush();
        expect(mocks.publish).toHaveBeenCalledOnce();
        expect(mocks.load).toHaveBeenCalledOnce();
    });
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mocks.load.mockResolvedValue(undefined);
        mocks.fetcher = { state: 'idle', data: undefined };
        mocks.navigation = 'idle';
        mocks.fetchers = [];
        mocks.current = undefined;
        mocks.auth = { authContextVersion: 'auth1' };
        mocks.site.currency = 'GBP';
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        writeCookie();
        mocks.publish.mockImplementation((result) => {
            document.cookie = result.cookie;
        });
    });
    afterEach(() => {
        vi.useRealTimers();
        document.cookie = '__sfdc_basket=; Max-Age=0; Path=/';
    });

    it('refreshes an unchanged cookie on entry and publishes basket and cookie once', () => {
        const { rerender } = renderHook(useHybridBasketRefresh);
        flush();
        expect(mocks.load).toHaveBeenCalledExactlyOnceWith('/resource/basket-refresh');
        expect(parseBasketCookie(document.cookie)?.totalItemCount).toBe(1);
        mocks.fetcher.data = response();
        rerender();
        flush();
        expect(mocks.publish).toHaveBeenCalledOnce();
        expect(parseBasketCookie(document.cookie)?.totalItemCount).toBe(2);
        rerender();
        flush();
        expect(mocks.load).toHaveBeenCalledTimes(1);
    });
    it('coalesces focus and visibility signals and retries on a later return after failure', () => {
        const { rerender } = renderHook(useHybridBasketRefresh);
        flush();
        onReturn();
        flush();
        expect(mocks.load).toHaveBeenCalledTimes(1);
        mocks.fetcher.data = { success: false };
        rerender();
        flush();
        onReturn();
        flush();
        expect(mocks.load).toHaveBeenCalledTimes(2);
    });
    it.each(['visibility', 'window'])('rechecks a return during an active read (%s)', (signal) => {
        const { rerender } = renderHook(useHybridBasketRefresh);
        flush();
        act(() => {
            if (signal === 'visibility') {
                Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
                document.dispatchEvent(new Event('visibilitychange'));
            } else window.dispatchEvent(new Event('blur'));
        });
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        onReturn();
        flush();
        expect(mocks.load).toHaveBeenCalledTimes(1);
        mocks.fetcher.data = response(1);
        rerender();
        flush();
        expect(mocks.publish).not.toHaveBeenCalled();
        expect(mocks.load).toHaveBeenCalledTimes(2);
        mocks.fetcher.data = response(2);
        rerender();
        flush();
        expect(parseBasketCookie(document.cookie)?.totalItemCount).toBe(2);
        expect(mocks.publish).toHaveBeenCalledOnce();
    });
    it('defers a trailing read while a visible window remains blurred', () => {
        const { rerender } = renderHook(useHybridBasketRefresh);
        flush();
        act(() => {
            window.dispatchEvent(new Event('blur'));
        });
        mocks.fetcher.data = response(1);
        rerender();
        flush();
        expect(mocks.publish).not.toHaveBeenCalled();
        expect(mocks.load).toHaveBeenCalledTimes(1);
        onReturn();
        flush();
        expect(mocks.load).toHaveBeenCalledTimes(2);
        mocks.fetcher.data = response(3);
        rerender();
        flush();
        expect(parseBasketCookie(document.cookie)?.totalItemCount).toBe(3);
        expect(mocks.publish).toHaveBeenCalledOnce();
    });
    it('defers a hidden mount until visible and refreshes on BFCache restoration', () => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        const { rerender } = renderHook(useHybridBasketRefresh);
        flush();
        expect(mocks.load).not.toHaveBeenCalled();
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        onReturn();
        flush();
        expect(mocks.load).toHaveBeenCalledTimes(1);
        mocks.fetcher.data = response();
        rerender();
        flush();
        act(() => {
            window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        });
        flush();
        expect(mocks.load).toHaveBeenCalledTimes(2);
    });
    it('checks an existing empty basket but never creates one for a cold visitor', () => {
        writeCookie(0);
        const hook = renderHook(useHybridBasketRefresh);
        flush();
        expect(mocks.load).toHaveBeenCalledOnce();
        hook.unmount();
        document.cookie = '__sfdc_basket=; Max-Age=0; Path=/';
        mocks.load.mockClear();
        renderHook(useHybridBasketRefresh);
        flush();
        expect(mocks.load).not.toHaveBeenCalled();
    });
    it('runs a pending entry after navigation settles', () => {
        mocks.navigation = 'loading';
        const { rerender } = renderHook(useHybridBasketRefresh);
        flush();
        expect(mocks.load).not.toHaveBeenCalled();
        mocks.navigation = 'idle';
        rerender();
        flush();
        expect(mocks.load).toHaveBeenCalledOnce();
    });
    it('rejects an overlapping older read without regressing the newer mutation cookie', () => {
        const { rerender } = renderHook(useHybridBasketRefresh);
        flush();
        mocks.fetchers = [{ key: 'cart-mutation', state: 'submitting' }];
        rerender();
        writeCookie(3);
        mocks.fetchers = [];
        mocks.fetcher.data = response(2);
        rerender();
        flush();
        expect(mocks.publish).not.toHaveBeenCalled();
        expect(parseBasketCookie(document.cookie)?.totalItemCount).toBe(3);
        expect(mocks.load).toHaveBeenCalledTimes(2);
        mocks.fetcher.data = response(3);
        rerender();
        flush();
        expect(parseBasketCookie(document.cookie)?.totalItemCount).toBe(3);
        expect(mocks.publish).toHaveBeenCalledOnce();
    });
    it.each(['auth', 'currency'])('rejects a response from an obsolete %s context', (change) => {
        const { rerender } = renderHook(useHybridBasketRefresh);
        flush();
        if (change === 'auth') mocks.auth = { authContextVersion: 'auth2' };
        else mocks.site.currency = 'USD';
        mocks.fetcher.data = response();
        rerender();
        flush();
        expect(mocks.publish).not.toHaveBeenCalled();
        expect(parseBasketCookie(document.cookie)?.totalItemCount).toBe(1);
    });
    it('does not schedule more entry reads when only the component rerenders', () => {
        const { rerender } = renderHook(useHybridBasketRefresh);
        flush();
        mocks.fetcher.data = response();
        rerender();
        flush();
        rerender();
        flush();
        expect(mocks.load).toHaveBeenCalledTimes(1);
    });
});
