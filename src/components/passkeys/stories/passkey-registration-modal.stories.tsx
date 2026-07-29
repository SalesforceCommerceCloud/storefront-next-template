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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, type ReactNode, type ReactElement } from 'react';
import { expect, within, userEvent, waitFor, fn } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { PasskeyRegistrationModal } from '../passkey-registration-modal';

/**
 * The modal drives its registration handshake entirely through `fetch()` (there's no
 * `useFetcher`/action route to mock via `parameters.mockRoutes`) and, on success, calls
 * the real WebAuthn `navigator.credentials.create()`. Neither exists in the Storybook/jsdom-less
 * browser test environment in a usable form, so each story installs its own `window.fetch`
 * stub (URL-branched, mirroring the component's own unit tests) and stubs
 * `navigator.credentials.create` only for the story that exercises the full success path.
 */
function withMockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
    return function MockFetchHarness({ children }: { children: ReactNode }): ReactElement {
        useEffect(() => {
            const originalFetch = window.fetch.bind(window);
            window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
                if (url.includes('/action/passkey-')) {
                    return handler(url, init);
                }
                return originalFetch(input, init);
            }) as typeof window.fetch;

            return () => {
                window.fetch = originalFetch;
            };
        }, []);

        return <>{children}</>;
    };
}

const successFetchHandler = () =>
    new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

const SuccessFetchHarness = withMockFetch(successFetchHandler);

const FailedAuthorizeHarness = withMockFetch(
    () =>
        new Response(JSON.stringify({ success: false }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
);

const FullFlowHarness = withMockFetch((url) => {
    if (url.includes('passkey-authorize-registration')) {
        return successFetchHandler();
    }
    if (url.includes('passkey-start-registration')) {
        return new Response(JSON.stringify({ success: true, publicKey: { rp: { id: 'localhost' } } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    if (url.includes('passkey-finish-registration')) {
        return successFetchHandler();
    }
    return successFetchHandler();
});

const meta: Meta<typeof PasskeyRegistrationModal> = {
    title: 'ACCOUNT/Passkeys/Passkey Registration Modal',
    component: PasskeyRegistrationModal,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'centered',
        docs: {
            story: { inline: false, height: '650px' },
            description: {
                component:
                    'Two-step passkey registration flow: name entry, then an email-OTP step that auto-submits once filled and calls the WebAuthn API to create the credential.',
            },
        },
    },
    argTypes: {
        open: { control: false, table: { disable: true } },
        onClose: { control: false, table: { disable: true } },
    },
    args: {
        open: true,
        userId: 'enc-user-1',
        onClose: fn(),
    },
};

export default meta;
type Story = StoryObj<typeof PasskeyRegistrationModal>;

export const NameStep: Story = {
    decorators: [
        (Story) => (
            <SuccessFetchHarness>
                <Story />
            </SuccessFetchHarness>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const documentBody = within(document.body);

        await expect(documentBody.getByRole('dialog')).toBeInTheDocument();
        await expect(documentBody.getByLabelText(/passkey name/i)).toBeInTheDocument();
        await expect(documentBody.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    },
};

export const EmptyNameShowsError: Story = {
    decorators: [
        (Story) => (
            <SuccessFetchHarness>
                <Story />
            </SuccessFetchHarness>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const documentBody = within(document.body);

        await userEvent.click(documentBody.getByRole('button', { name: /continue/i }));
        await expect(documentBody.getByText(/enter a name/i)).toBeInTheDocument();
    },
};

export const OtpStep: Story = {
    decorators: [
        (Story) => (
            <SuccessFetchHarness>
                <Story />
            </SuccessFetchHarness>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const documentBody = within(document.body);

        await userEvent.type(documentBody.getByLabelText(/passkey name/i), 'MacBook Pro');
        await userEvent.click(documentBody.getByRole('button', { name: /continue/i }));

        const otpInputs = await documentBody.findAllByRole('textbox');
        await expect(otpInputs).toHaveLength(6);
    },
};

export const AuthorizeFailure: Story = {
    decorators: [
        (Story) => (
            <FailedAuthorizeHarness>
                <Story />
            </FailedAuthorizeHarness>
        ),
    ],
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const documentBody = within(document.body);

        await userEvent.type(documentBody.getByLabelText(/passkey name/i), 'MacBook Pro');
        await userEvent.click(documentBody.getByRole('button', { name: /continue/i }));

        await waitFor(async () => {
            await expect(documentBody.getByText(/passkey creation failed/i)).toBeInTheDocument();
        });
    },
};

export const FullRegistrationFlow: Story = {
    decorators: [
        (Story) => (
            <FullFlowHarness>
                <Story />
            </FullFlowHarness>
        ),
    ],
    beforeEach: () => {
        const credential = {
            id: 'cred-id',
            type: 'public-key',
            toJSON: () => ({ id: 'cred-id', type: 'public-key' }),
        };
        const originalCredentials = navigator.credentials;
        Object.defineProperty(navigator, 'credentials', {
            configurable: true,
            value: { ...originalCredentials, create: async () => credential },
        });

        // The mock publicKey payload lacks the fields the real WebAuthn API requires
        // (challenge, user, pubKeyCredParams, etc.), so the browser's real
        // parseCreationOptionsFromJSON would throw. The component always calls this method
        // (both registration entry points are gated on its presence), so stub it as a
        // pass-through that returns the options unchanged, mirroring the unit test's WebAuthn stub.
        const originalParse = window.PublicKeyCredential?.parseCreationOptionsFromJSON?.bind(
            window.PublicKeyCredential
        );
        if (window.PublicKeyCredential) {
            window.PublicKeyCredential.parseCreationOptionsFromJSON = ((options: unknown) => options) as never;
        }

        return () => {
            Object.defineProperty(navigator, 'credentials', {
                configurable: true,
                value: originalCredentials,
            });
            if (window.PublicKeyCredential && originalParse) {
                window.PublicKeyCredential.parseCreationOptionsFromJSON = originalParse;
            }
        };
    },
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const documentBody = within(document.body);

        await userEvent.type(documentBody.getByLabelText(/passkey name/i), 'MacBook Pro');
        await userEvent.click(documentBody.getByRole('button', { name: /continue/i }));

        const otpInputs = await documentBody.findAllByRole('textbox');
        for (let i = 0; i < otpInputs.length; i++) {
            await userEvent.type(otpInputs[i], '1');
        }

        await waitFor(async () => {
            await expect(args.onClose).toHaveBeenCalled();
        });
    },
};
