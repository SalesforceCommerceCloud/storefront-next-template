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
 * BEFORE/AFTER proof for the i18n hydration-mismatch fix.
 *
 * WHY THE BUG EXISTS
 * ------------------
 * The SERVER renders with all translations loaded, so the SSR HTML contains real
 * translated text. The CLIENT initializes i18next via `initI18next` with an ASYNC
 * dynamic-import backend and NO preloaded resources (`ns: []`). If React hydrates
 * before that backend resolves, the client's `t()` returns the KEY/fallback —
 * different text than the server put in the DOM → React hydration mismatch. It's a
 * race, most visible in dev where the locale is a separate over-the-network chunk.
 *
 * THE FIX
 * -------
 * The template gates hydration on translation readiness: it AWAITS the initial
 * language's namespaces (via the same async backend) BEFORE calling `hydrateRoot`
 * (see template `entry.client.tsx` + `whenI18nReady()`). This makes the first
 * client render `ready` — matching the server — with NO bytes added to the document
 * (unlike inlining the bundle). These tests prove the underlying invariant the fix
 * relies on: hydrating while NOT ready mismatches; hydrating AFTER the backend has
 * loaded does not.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from '@testing-library/react';
import i18next, { type Resource } from 'i18next';
import { initI18next } from './client';

const LANGUAGE = 'en-US';
// One namespace + key is enough to prove the text divergence.
const RESOURCES: Resource = { [LANGUAGE]: { home: { title: 'Welcome' } } };

// The text a component renders. Reads `t` directly (no Suspense) so the assertion is
// purely about WHICH STRING i18next yields at render time — the root signal behind the
// hydration mismatch — not about Suspense/boundary mechanics layered on top.
function Greeting({ t }: { t: (key: string) => string }) {
    return `${t('home:title')}`;
}

/** Async import backend that resolves LATER — models the real Vite locale chunk. */
function makeAsyncLoadLocale() {
    return () => Promise.resolve({ default: RESOURCES[LANGUAGE] });
}

/** Server-side: instance created WITH resources, exactly as the middleware does. */
function makeServerInstance() {
    const instance = i18next.createInstance();
    void instance.init({ lng: LANGUAGE, resources: RESOURCES, interpolation: { escapeValue: false } });
    return instance;
}

/** Client-style instance: async backend, no preloaded resources (as `initI18next` does). */
function makeClientInstance() {
    return initI18next({
        language: LANGUAGE,
        instance: i18next.createInstance(),
        loadLocale: makeAsyncLoadLocale(),
    });
}

describe('i18n hydration parity — before/after proof', () => {
    it('SERVER renders the translated string', () => {
        const server = makeServerInstance();
        const serverMarkup = renderToStaticMarkup(<Greeting t={server.t.bind(server)} />);
        expect(serverMarkup).toBe('Welcome'); // ground truth in the SSR HTML
    });

    it('BEFORE (hydrate while not ready): client first paint DIVERGES from server → mismatch', () => {
        const server = makeServerInstance();
        const serverMarkup = renderToStaticMarkup(<Greeting t={server.t.bind(server)} />);

        // Client init as the app does: async backend, no resources yet loaded.
        const client = makeClientInstance();

        // Synchronous first render (the hydration moment): the async chunk has not
        // resolved, so the store is empty and `t` yields the key, not "Welcome".
        const clientFirstPaint = renderToStaticMarkup(<Greeting t={client.t.bind(client)} />);

        expect(client.getResource(LANGUAGE, 'home', 'title')).toBeUndefined();
        expect(clientFirstPaint).not.toBe('Welcome');
        expect(clientFirstPaint).not.toBe(serverMarkup); // ← the hydration mismatch
    });

    it('AFTER (await readiness before render): client first paint MATCHES server → no mismatch', async () => {
        const server = makeServerInstance();
        const serverMarkup = renderToStaticMarkup(<Greeting t={server.t.bind(server)} />);

        const client = makeClientInstance();

        // The fix: await the initial-language load (what `whenI18nReady()` does)
        // BEFORE the first render — modeling hydration deferred until i18n is ready.
        await client.loadNamespaces('home');

        const clientFirstPaint = renderToStaticMarkup(<Greeting t={client.t.bind(client)} />);

        expect(client.getResource(LANGUAGE, 'home', 'title')).toBe('Welcome');
        expect(clientFirstPaint).toBe('Welcome');
        expect(clientFirstPaint).toBe(serverMarkup); // ← parity: mismatch eliminated
    });
});

/**
 * The above proves the text divergence (the root cause). This block proves the
 * actual SYMPTOM: React emits a hydration-mismatch console error when hydrating
 * while NOT ready, and stays silent when hydrating AFTER readiness — a real
 * `hydrateRoot` over server HTML.
 */
describe('i18n hydration parity — React hydrateRoot symptom', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Wrap in a real element so <Greeting>'s text is a hydratable text node.
    function Page({ t }: { t: (key: string) => string }) {
        return <span>{t('home:title')}</span>;
    }

    // Hydrate a client tree over server-rendered HTML and collect the console.error
    // strings React emits. A hydration mismatch shows up here as React's
    // "Hydration failed because the server rendered text didn't match" diagnostic.
    function hydrateAndCollectErrors(clientT: (key: string) => string, serverHtml: string): string[] {
        const errors: string[] = [];
        const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            errors.push(args.map(String).join(' '));
        });

        const container = document.createElement('div');
        container.innerHTML = serverHtml; // the SSR markup the browser received
        document.body.appendChild(container);

        // hydrateRoot is synchronous; act() flushes the initial hydration render so
        // React's mismatch diagnostic is emitted before we restore the spy.
        act(() => {
            hydrateRoot(container, <Page t={clientT} />);
        });

        spy.mockRestore();
        container.remove();
        return errors;
    }

    // Match React 19's specific diagnostic, verified as the exact string emitted:
    // "Hydration failed because the server rendered text didn't match the client."
    // Kept narrow so an unrelated console.error can't make the BEFORE test pass.
    const isHydrationError = (msg: string) =>
        /hydration failed/i.test(msg) || /server rendered .*(?:did ?n['’]?t|not) match/i.test(msg);

    it('BEFORE: hydrating while not ready emits a hydration mismatch error', () => {
        const server = makeServerInstance();
        const serverHtml = renderToStaticMarkup(<Page t={server.t.bind(server)} />); // "<span>Welcome</span>"

        const client = makeClientInstance();

        const errors = hydrateAndCollectErrors(client.t.bind(client), serverHtml);
        expect(errors.some(isHydrationError)).toBe(true); // React complains
    });

    it('AFTER: hydrating after readiness emits NO hydration mismatch error', async () => {
        const server = makeServerInstance();
        const serverHtml = renderToStaticMarkup(<Page t={server.t.bind(server)} />);

        const client = makeClientInstance();
        await client.loadNamespaces('home'); // gate hydration on readiness (the fix)

        const errors = hydrateAndCollectErrors(client.t.bind(client), serverHtml);
        expect(errors.filter(isHydrationError)).toEqual([]); // React silent
    });
});

/**
 * PERFORMANCE guard: the delaying fix loads translations via the async backend —
 * it does NOT inline them into the document.
 *
 * The abandoned approach inlined the bundle into the SSR HTML (regressing
 * Lighthouse `resource-summary:document:size`). The delaying fix instead reuses
 * the existing `loadLocale` backend and simply awaits it before hydrating: the
 * initial language is fetched from the locale chunk (via `loadLocale`), and once
 * loaded, a second request for the same namespace resolves from the store without
 * re-invoking the backend for it.
 */
describe('i18n delaying fix — loaded via backend, nothing inlined', () => {
    it('loads the initial language via loadLocale (not from the document)', async () => {
        const loadLocale = vi.fn(() => Promise.resolve({ default: RESOURCES[LANGUAGE] }));

        const client = initI18next({
            language: LANGUAGE,
            instance: i18next.createInstance(),
            loadLocale,
        });

        await client.loadNamespaces('home');

        expect(loadLocale).toHaveBeenCalledWith(LANGUAGE);
        expect(client.getResource(LANGUAGE, 'home', 'title')).toBe('Welcome');
    });

    it('does not re-fetch a namespace already in the store', async () => {
        const loadLocale = vi.fn(() => Promise.resolve({ default: RESOURCES[LANGUAGE] }));

        const client = initI18next({
            language: LANGUAGE,
            instance: i18next.createInstance(),
            loadLocale,
        });

        await client.loadNamespaces('home');
        const callsAfterFirst = loadLocale.mock.calls.length;

        // Second request for the SAME already-loaded namespace: served from the
        // store, no additional backend fetch for it.
        await client.loadNamespaces('home');
        expect(loadLocale.mock.calls.length).toBe(callsAfterFirst);
    });
});
