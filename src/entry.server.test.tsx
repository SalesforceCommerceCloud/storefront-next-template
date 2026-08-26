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
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { EntryContext, RouterContextProvider } from 'react-router';
import { securityContext } from '@salesforce/storefront-next-runtime/security';
import handleRequest from './entry.server';

const mocks = vi.hoisted(() => ({
    initializeRegistry: vi.fn(),
    isbot: vi.fn(() => false),
    abort: vi.fn(),
    renderMode: 'ready' as 'ready' | 'shell-error' | 'error-before-ready' | 'error-after-ready' | 'pending',
}));

vi.mock('@/lib/page-designer/static-registry', () => ({ initializeRegistry: mocks.initializeRegistry }));

// Mock react-dom/server to capture the props passed by handleRequest.
// We don't actually need a real React render — just verify the wiring.
//
// The element passed to renderToPipeableStream is:
//   <NonceContext.Provider value={nonce}>
//     <ServerRouter nonce={nonce} ... />
//   </NonceContext.Provider>
// So `element.props.value` is the context-provider value, and
// `element.props.children.props.nonce` is the <ServerRouter> nonce.
type ServerRouterElement = { props: { nonce?: string } };
type CapturedCall = {
    element: { props: { value?: string; children: ServerRouterElement } };
    options: {
        nonce?: string;
        onShellReady?: () => void;
        onAllReady?: () => void;
        onShellError: (error: unknown) => void;
        onError: (error: unknown) => void;
    };
};
const captured: CapturedCall[] = [];
vi.mock('react-dom/server', () => ({
    renderToPipeableStream: (element: unknown, options: Record<string, unknown>) => {
        captured.push({
            element: element as CapturedCall['element'],
            options: options as CapturedCall['options'],
        });
        const callbacks = options as CapturedCall['options'];
        const ready = callbacks.onShellReady ?? callbacks.onAllReady;
        queueMicrotask(() => {
            if (mocks.renderMode === 'pending') return;
            if (mocks.renderMode === 'shell-error') {
                callbacks.onShellError(new Error('shell failed'));
                return;
            }
            if (mocks.renderMode === 'error-before-ready') callbacks.onError(new Error('render failed'));
            ready?.();
            if (mocks.renderMode === 'error-after-ready') callbacks.onError(new Error('stream failed'));
        });
        return {
            pipe: (body: { end: () => void }) => body.end(),
            abort: mocks.abort,
        };
    },
}));

vi.mock('@react-router/node', () => ({
    createReadableStreamFromReadable: () => new ReadableStream(),
}));

vi.mock('isbot', () => ({ isbot: mocks.isbot }));

function makeRouterContext(nonce: string | null): RouterContextProvider {
    const store = new Map<unknown, unknown>();
    if (nonce !== null) store.set(securityContext, { nonce });
    return {
        get: (k: unknown) => store.get(k),
        set: (k: unknown, v: unknown) => store.set(k, v),
    } as unknown as RouterContextProvider;
}

const fakeEntryContext = { isSpaMode: false } as unknown as EntryContext;

describe('entry.server', () => {
    beforeEach(() => {
        captured.length = 0;
        mocks.abort.mockClear();
        mocks.isbot.mockReset().mockReturnValue(false);
        mocks.renderMode = 'ready';
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('initializes the Page Designer registry when the server entry module starts', () => {
        expect(mocks.initializeRegistry).toHaveBeenCalledOnce();
    });

    it('forwards the nonce from securityContext to <ServerRouter>, NonceContext, and renderToPipeableStream', async () => {
        const ctx = makeRouterContext('abc123==');
        await handleRequest(
            new Request('http://localhost/', { headers: { 'user-agent': 'browser' } }),
            200,
            new Headers(),
            fakeEntryContext,
            ctx
        );
        expect(captured).toHaveLength(1);
        // <NonceContext.Provider value={nonce}> — covers the error-path fallback
        // when the root loader throws and useRouteLoaderData is unavailable.
        expect(captured[0].element.props.value).toBe('abc123==');
        // <ServerRouter nonce={...}> (child of NonceContext.Provider) — covers
        // RR's StreamTransfer chunks for deferred-data hydration.
        expect(captured[0].element.props.children.props.nonce).toBe('abc123==');
        // renderToPipeableStream({ nonce, ... }) — covers react-dom Float / Suspense instructions.
        expect(captured[0].options.nonce).toBe('abc123==');
        expect(mocks.isbot).toHaveBeenCalledWith('browser');
    });

    it('passes undefined when securityContext is unset (security middleware disabled)', async () => {
        const ctx = makeRouterContext(null);
        await handleRequest(new Request('http://localhost/'), 200, new Headers(), fakeEntryContext, ctx);
        expect(captured).toHaveLength(1);
        expect(captured[0].element.props.value).toBeUndefined();
        expect(captured[0].element.props.children.props.nonce).toBeUndefined();
        expect(captured[0].options.nonce).toBeUndefined();
    });

    it('returns an empty Response immediately for HEAD requests without rendering', async () => {
        const ctx = makeRouterContext('abc123==');
        const res = await handleRequest(
            new Request('http://localhost/', { method: 'HEAD' }),
            200,
            new Headers(),
            fakeEntryContext,
            ctx
        );
        expect(res.status).toBe(200);
        expect(captured).toHaveLength(0);
    });

    it.each([
        ['bot request', new Request('http://localhost/', { headers: { 'user-agent': 'crawler' } }), false],
        ['SPA mode', new Request('http://localhost/'), true],
    ])('waits for all content for a %s', async (_label, request, isSpaMode) => {
        mocks.isbot.mockReturnValue(true);
        const routerContext = { isSpaMode } as unknown as EntryContext;

        await handleRequest(request, 200, new Headers(), routerContext, makeRouterContext(null));

        expect(captured[0].options.onAllReady).toBeTypeOf('function');
    });

    it('rejects when the shell cannot render', async () => {
        vi.useFakeTimers();
        mocks.renderMode = 'shell-error';

        await expect(
            handleRequest(
                new Request('http://localhost/'),
                200,
                new Headers(),
                fakeEntryContext,
                makeRouterContext(null)
            )
        ).rejects.toThrow('shell failed');
    });

    it('returns status 500 when rendering fails before the shell is ready', async () => {
        mocks.renderMode = 'error-before-ready';

        const response = await handleRequest(
            new Request('http://localhost/'),
            200,
            new Headers(),
            fakeEntryContext,
            makeRouterContext(null)
        );

        expect(response.status).toBe(500);
    });

    it('logs rendering failures after the shell is ready', async () => {
        mocks.renderMode = 'error-after-ready';
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await handleRequest(
            new Request('http://localhost/'),
            200,
            new Headers(),
            fakeEntryContext,
            makeRouterContext(null)
        );

        expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'stream failed' }));
    });

    it('aborts a render that exceeds the stream timeout', async () => {
        vi.useFakeTimers();
        mocks.renderMode = 'pending';

        void handleRequest(
            new Request('http://localhost/'),
            200,
            new Headers(),
            fakeEntryContext,
            makeRouterContext(null)
        );
        await vi.advanceTimersByTimeAsync(6_000);

        expect(mocks.abort).toHaveBeenCalledOnce();
    });
});
