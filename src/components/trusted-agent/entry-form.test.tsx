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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import AgentEntryForm from '@/components/trusted-agent/entry-form';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { SiteProvider } from '@salesforce/storefront-next-runtime/site-context';
import { mockConfig, mockSiteObject } from '@/test-utils/config';

const nonce = '11111111-1111-4111-8111-111111111111';
function entry() {
    const Stub = createRoutesStub([
        {
            path: '/',
            Component: () => (
                <AgentEntryForm
                    loginId="shopper@example.com"
                    nonce={nonce}
                    action="/login/agent"
                    returnUrl="/cart"
                    mode="start"
                    pending={false}
                    failed={false}
                />
            ),
        },
    ]);
    return render(
        <ConfigProvider config={mockConfig}>
            <SiteProvider
                site={mockSiteObject}
                locale={mockSiteObject.supportedLocales[0]}
                language="en-GB"
                currency={mockSiteObject.defaultCurrency}>
                <Stub initialEntries={['/']} />
            </SiteProvider>
        </ConfigProvider>
    );
}
afterEach(() => vi.restoreAllMocks());

describe('agent authorization popup coordination', () => {
    it('accepts completion only from the expected origin, source window, and correlation', async () => {
        vi.spyOn(window, 'open').mockReturnValue(window);
        const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
        const view = entry();
        const button = await view.findByRole('button', { name: 'Continue' });
        const form = button.closest('form');
        if (!form) throw new Error('Missing form');
        fireEvent(form, new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: button }));
        expect(form.target).toBe(`taob-${nonce}`);
        const message = { type: 'TAOB_AUTH_COMPLETE', correlation: nonce, status: 'error' };
        fireEvent(
            window,
            new MessageEvent('message', { origin: 'https://untrusted.example', source: window, data: message })
        );
        fireEvent(window, new MessageEvent('message', { origin: window.location.origin, source: null, data: message }));
        fireEvent(
            window,
            new MessageEvent('message', {
                origin: window.location.origin,
                source: window,
                data: { ...message, correlation: 'wrong' },
            })
        );
        expect(close).not.toHaveBeenCalled();
        await waitFor(() => expect(button).toBeDisabled());
        fireEvent(
            window,
            new MessageEvent('message', { origin: window.location.origin, source: window, data: message })
        );
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
        expect(await view.findByRole('alert')).toHaveTextContent('Authorization could not be completed');
        expect(button).not.toBeDisabled();
    });

    it('falls back to a full-page form target when the popup is blocked', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        const view = entry();
        const button = await view.findByRole('button', { name: 'Continue' });
        const form = button.closest('form');
        if (!form) throw new Error('Missing form');
        fireEvent(form, new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: button }));
        expect(open).toHaveBeenCalledOnce();
        expect(form.target).toBe('_self');
        expect(form.querySelector<HTMLInputElement>('input[name="popup"]')?.value).toBe('false');
    });
});
