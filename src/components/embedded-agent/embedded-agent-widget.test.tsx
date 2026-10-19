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
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';

vi.mock('@/lib/utils', async () => {
    const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');
    return {
        ...actual,
        resolveAssetUrl: (url: string) => url,
    };
});

// `readyPromise` is module-scoped in the SUT; reset modules between tests so
// each test gets a fresh script-load state instead of leaking resolved promises.
async function loadFreshModule() {
    vi.resetModules();
    return await import('./embedded-agent-widget');
}

const baseConfig = {
    enabled: true,
    scrt2Url: 'https://scrt2.example.com',
    orgId: '00D000000000000',
    esDeveloperName: 'My_Agent',
} as const;

/**
 * `customElements.whenDefined()` in jsdom returns an unresolved promise until
 * define() is called. Stub it so tests can resolve the ready-promise on demand
 * without actually registering a global custom element (globals leak across files).
 */
let whenDefinedResolve: () => void;
let whenDefinedReject: (err: Error) => void;
let getReturn: CustomElementConstructor | undefined;
let whenDefinedSpy: ReturnType<typeof vi.spyOn>;
let getSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    getReturn = undefined;
    whenDefinedSpy = vi.spyOn(customElements, 'whenDefined').mockImplementation(() => {
        return new Promise<CustomElementConstructor>((resolve, reject) => {
            whenDefinedResolve = () => resolve(class {} as unknown as CustomElementConstructor);
            whenDefinedReject = reject;
        });
    });
    getSpy = vi.spyOn(customElements, 'get').mockImplementation(() => getReturn);
});

afterEach(() => {
    whenDefinedSpy.mockRestore();
    getSpy.mockRestore();
    document.head.querySelectorAll('script[src*="inline-agent-widget"]').forEach((s) => s.remove());
});

describe('<EmbeddedAgentWidget>', () => {
    test('renders nothing when the config is not fully populated', async () => {
        const { EmbeddedAgentWidget } = await loadFreshModule();
        const { container } = render(<EmbeddedAgentWidget config={{ ...baseConfig, enabled: false }} />);
        expect(container.firstChild).toBeNull();
    });

    test('injects the UMD script tag and creates the custom element with attributes', async () => {
        const { EmbeddedAgentWidget } = await loadFreshModule();
        const { container } = render(
            <EmbeddedAgentWidget
                config={{
                    ...baseConfig,
                    placeholder: 'Ask me anything',
                    persistSession: true,
                    enableLogging: true,
                    productIdParam: 'pid',
                    productIdPattern: '/custom/([^/]+)',
                    capabilitiesVersion: '99',
                }}
                pdpQuestions={['How tall?', 'Ships fast?']}
                productName="Widget Pro"
            />
        );

        const script = document.head.querySelector('script[src="/inline-agent-widget.umd.js"]') as HTMLScriptElement;
        expect(script).not.toBeNull();
        expect(script.async).toBe(true);

        act(() => whenDefinedResolve());

        const el = await waitFor(() => {
            const found = container.querySelector('inline-agent-widget');
            if (!found) throw new Error('custom element not yet mounted');
            return found;
        });

        expect(el.getAttribute('scrt2-url')).toBe(baseConfig.scrt2Url);
        expect(el.getAttribute('org-id')).toBe(baseConfig.orgId);
        expect(el.getAttribute('es-developer-name')).toBe(baseConfig.esDeveloperName);
        expect(el.getAttribute('capabilities-version')).toBe('99');
        expect(el.getAttribute('placeholder')).toBe('Ask me anything');
        expect(el.hasAttribute('persist-session')).toBe(true);
        expect(el.hasAttribute('enable-logging')).toBe(true);
        expect(el.getAttribute('product-id-param')).toBe('pid');
        expect(el.getAttribute('product-id-pattern')).toBe('/custom/([^/]+)');
        expect(el.getAttribute('product-name')).toBe('Widget Pro');
        expect(JSON.parse(el.getAttribute('pdp-questions') ?? '[]')).toEqual(['How tall?', 'Ships fast?']);
    });

    test('falls back to the default product-id pattern when none is configured', async () => {
        const { EmbeddedAgentWidget } = await loadFreshModule();
        const { container } = render(<EmbeddedAgentWidget config={baseConfig} />);
        act(() => whenDefinedResolve());

        const el = await waitFor(() => {
            const found = container.querySelector('inline-agent-widget');
            if (!found) throw new Error('not yet');
            return found;
        });
        expect(el.getAttribute('product-id-pattern')).toBe('/p/(?:[^?#]*/)?([^/?#]+)');
    });

    test('skips persist-session / enable-logging attributes when the config opts out', async () => {
        const { EmbeddedAgentWidget } = await loadFreshModule();
        const { container } = render(
            <EmbeddedAgentWidget config={{ ...baseConfig, persistSession: false, enableLogging: false }} />
        );
        act(() => whenDefinedResolve());

        const el = await waitFor(() => {
            const found = container.querySelector('inline-agent-widget');
            if (!found) throw new Error('not yet');
            return found;
        });
        expect(el.hasAttribute('persist-session')).toBe(false);
        expect(el.hasAttribute('enable-logging')).toBe(false);
    });

    test('syncs product-name when it changes without re-creating the element', async () => {
        const { EmbeddedAgentWidget } = await loadFreshModule();
        const { container, rerender } = render(<EmbeddedAgentWidget config={baseConfig} productName="First" />);
        act(() => whenDefinedResolve());

        const first = await waitFor(() => {
            const found = container.querySelector('inline-agent-widget');
            if (!found) throw new Error('not yet');
            return found;
        });
        expect(first.getAttribute('product-name')).toBe('First');

        rerender(<EmbeddedAgentWidget config={baseConfig} productName="Second" />);
        await waitFor(() => expect(first.getAttribute('product-name')).toBe('Second'));

        // Same element instance — not a remount.
        expect(container.querySelectorAll('inline-agent-widget')).toHaveLength(1);
        expect(container.querySelector('inline-agent-widget')).toBe(first);
    });

    test('removes product-name attribute when productName goes undefined', async () => {
        const { EmbeddedAgentWidget } = await loadFreshModule();
        const { container, rerender } = render(<EmbeddedAgentWidget config={baseConfig} productName="Was there" />);
        act(() => whenDefinedResolve());

        const el = await waitFor(() => {
            const found = container.querySelector('inline-agent-widget');
            if (!found) throw new Error('not yet');
            return found;
        });
        expect(el.getAttribute('product-name')).toBe('Was there');

        rerender(<EmbeddedAgentWidget config={baseConfig} />);
        await waitFor(() => expect(el.hasAttribute('product-name')).toBe(false));
    });

    test('syncs pdp-questions when the array content changes', async () => {
        const { EmbeddedAgentWidget } = await loadFreshModule();
        const { container, rerender } = render(<EmbeddedAgentWidget config={baseConfig} pdpQuestions={['A']} />);
        act(() => whenDefinedResolve());

        const el = await waitFor(() => {
            const found = container.querySelector('inline-agent-widget');
            if (!found) throw new Error('not yet');
            return found;
        });
        expect(JSON.parse(el.getAttribute('pdp-questions') ?? '[]')).toEqual(['A']);

        rerender(<EmbeddedAgentWidget config={baseConfig} pdpQuestions={['A', 'B']} />);
        await waitFor(() => expect(JSON.parse(el.getAttribute('pdp-questions') ?? '[]')).toEqual(['A', 'B']));
        rerender(<EmbeddedAgentWidget config={baseConfig} pdpQuestions={[]} />);
        await waitFor(() => expect(el.hasAttribute('pdp-questions')).toBe(false));
    });

    test('reuses an existing script tag rather than appending a duplicate', async () => {
        const existing = document.createElement('script');
        existing.src = '/inline-agent-widget.umd.js';
        document.head.appendChild(existing);

        const { EmbeddedAgentWidget } = await loadFreshModule();
        render(<EmbeddedAgentWidget config={baseConfig} />);

        const scripts = document.head.querySelectorAll('script[src="/inline-agent-widget.umd.js"]');
        expect(scripts).toHaveLength(1);
    });

    test('resolves immediately when the custom element is already defined', async () => {
        getReturn = class {} as unknown as CustomElementConstructor;
        const { EmbeddedAgentWidget } = await loadFreshModule();
        const { container } = render(<EmbeddedAgentWidget config={baseConfig} />);

        await waitFor(() => {
            expect(container.querySelector('inline-agent-widget')).not.toBeNull();
        });
    });

    test('does not throw when the script fails to load', async () => {
        const { EmbeddedAgentWidget } = await loadFreshModule();
        const { container } = render(<EmbeddedAgentWidget config={baseConfig} />);

        const script = document.head.querySelector('script[src="/inline-agent-widget.umd.js"]') as HTMLScriptElement;
        act(() => {
            script.dispatchEvent(new Event('error'));
            whenDefinedReject(new Error('never defined'));
        });

        // Container exists (component rendered) but no custom element inside.
        await waitFor(() => {
            expect(container.querySelector('[data-testid="embedded-agent-widget"]')).not.toBeNull();
        });
        expect(container.querySelector('inline-agent-widget')).toBeNull();
    });

    test('removes the failed <script> on error so the next mount retries from scratch', async () => {
        const { EmbeddedAgentWidget } = await loadFreshModule();
        const { unmount } = render(<EmbeddedAgentWidget config={baseConfig} />);

        const script = document.head.querySelector('script[src="/inline-agent-widget.umd.js"]') as HTMLScriptElement;
        expect(script).not.toBeNull();

        act(() => {
            script.dispatchEvent(new Event('error'));
            whenDefinedReject(new Error('never defined'));
        });

        await waitFor(() => {
            expect(document.head.querySelector('script[src="/inline-agent-widget.umd.js"]')).toBeNull();
        });

        unmount();
        // Fresh mount — a new <script> should be appended, not blocked by a stale node.
        render(<EmbeddedAgentWidget config={baseConfig} />);
        const fresh = document.head.querySelector('script[src="/inline-agent-widget.umd.js"]');
        expect(fresh).not.toBeNull();
        expect(fresh).not.toBe(script);
    });
});
