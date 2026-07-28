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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import type { AppConfig } from '@/types/config';
import { PasskeyRegistrationModal } from './passkey-registration-modal';

const mockNavigate = vi.fn();
vi.mock('@/hooks/use-navigate', () => ({
    useNavigate: () => mockNavigate,
}));

const mockToastSuccess = vi.fn();
vi.mock('@/components/toast', () => ({
    toast: { success: (...args: unknown[]) => mockToastSuccess(...args) },
}));

function renderModal(
    props: Partial<React.ComponentProps<typeof PasskeyRegistrationModal>> = {},
    config: AppConfig = mockConfig
) {
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <ConfigProvider config={config}>
                        <PasskeyRegistrationModal open={true} userId="enc-user-1" onClose={vi.fn()} {...props} />
                    </ConfigProvider>
                ),
            },
        ],
        { initialEntries: ['/'], initialIndex: 0 }
    );
    return render(<RouterProvider router={router} />);
}

async function advanceToOtpStep(user: ReturnType<typeof userEvent.setup>, name = 'MacBook Pro') {
    await user.type(screen.getByRole('textbox', { name: /passkey name/i }), name);
    await user.click(screen.getByRole('button', { name: /continue/i }));
}

describe('PasskeyRegistrationModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('visibility', () => {
        it('renders dialog when open is true', () => {
            renderModal();
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        it('does not render dialog when open is false', () => {
            renderModal({ open: false });
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    describe('name step', () => {
        it('shows the name input first and does not send an OTP yet', () => {
            renderModal();
            expect(screen.getByRole('textbox', { name: /passkey name/i })).toBeInTheDocument();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('shows an error and does not advance when continuing with an empty name', async () => {
            const user = userEvent.setup();
            renderModal();

            await user.click(screen.getByRole('button', { name: /continue/i }));

            expect(screen.getByText(/enter a name/i)).toBeInTheDocument();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('shows an error and does not advance when the name exceeds 128 characters', async () => {
            const user = userEvent.setup();
            renderModal();

            await user.type(screen.getByRole('textbox', { name: /passkey name/i }), 'a'.repeat(129));
            await user.click(screen.getByRole('button', { name: /continue/i }));

            expect(screen.getByText(/128 characters or fewer/i)).toBeInTheDocument();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('advances to the OTP step once a name is entered', async () => {
            const user = userEvent.setup();
            renderModal({}, { ...mockConfig, auth: { otpLength: 6 } });

            await advanceToOtpStep(user);

            await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(6));
        });
    });

    describe('OTP slot count — driven by config.auth.otpLength', () => {
        it('renders 6 slots when config.auth.otpLength is 6', async () => {
            const user = userEvent.setup();
            renderModal({}, { ...mockConfig, auth: { otpLength: 6 } });
            await advanceToOtpStep(user);
            await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(6));
        });

        it('renders 8 slots when config.auth.otpLength is 8', async () => {
            const user = userEvent.setup();
            renderModal({}, { ...mockConfig, auth: { otpLength: 8 } });
            await advanceToOtpStep(user);
            await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(8));
        });
    });

    describe('sending the initial OTP', () => {
        it('sends the authorize-registration request once the name step is completed', async () => {
            const user = userEvent.setup();
            renderModal();
            await advanceToOtpStep(user);

            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    '/action/passkey-authorize-registration',
                    expect.objectContaining({ method: 'POST' })
                );
            });
            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('shows an error when authorize-registration fails', async () => {
            const user = userEvent.setup();
            vi.spyOn(global, 'fetch').mockResolvedValue(
                new Response(JSON.stringify({ success: false }), { status: 500 })
            );

            renderModal();
            await advanceToOtpStep(user);

            await waitFor(() => {
                expect(screen.getByText(/passkey creation failed/i)).toBeInTheDocument();
            });
        });
    });

    describe('resend', () => {
        it('disables resend during the countdown and re-sends the OTP on click', async () => {
            const user = userEvent.setup();
            renderModal();
            await advanceToOtpStep(user);

            await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

            await user.click(screen.getByRole('button', { name: /resend code/i }));

            await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
            expect(screen.getByRole('button', { name: /resend in/i })).toBeDisabled();
        });
    });

    describe('auto-submit and registration flow', () => {
        it('does not attempt start-registration before all visible slots are filled', async () => {
            const user = userEvent.setup();
            renderModal({}, { ...mockConfig, auth: { otpLength: 6 } });
            await advanceToOtpStep(user);
            await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

            const inputs = screen.getAllByRole('textbox');
            await user.type(inputs[0], '1');
            await user.type(inputs[1], '1');

            expect(global.fetch).toHaveBeenCalledTimes(1);
        });

        it('runs the full registration flow and shows a success toast once all slots are filled', async () => {
            const user = userEvent.setup();
            const credential = {
                id: 'cred-id',
                type: 'public-key',
                toJSON: () => ({ id: 'cred-id', type: 'public-key' }),
            };
            // Production gates both registration entry points on `parseCreationOptionsFromJSON`
            // being present, so the modal calls it directly. jsdom doesn't implement WebAuthn —
            // stub it as a pass-through that returns the options unchanged.
            vi.stubGlobal('PublicKeyCredential', {
                parseCreationOptionsFromJSON: (options: unknown) => options,
            });
            vi.stubGlobal('navigator', {
                ...navigator,
                credentials: { create: vi.fn().mockResolvedValue(credential) },
            });

            vi.spyOn(global, 'fetch').mockImplementation((input) => {
                const url = typeof input === 'string' ? input : (input as Request).url;
                if (url.includes('passkey-authorize-registration')) {
                    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
                }
                if (url.includes('passkey-start-registration')) {
                    return Promise.resolve(
                        new Response(JSON.stringify({ success: true, publicKey: { rp: { id: 'example.com' } } }), {
                            status: 200,
                        })
                    );
                }
                if (url.includes('passkey-finish-registration')) {
                    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
                }
                return Promise.resolve(new Response('{}', { status: 200 }));
            });

            const onClose = vi.fn();
            renderModal({ onClose }, { ...mockConfig, auth: { otpLength: 6 } });
            await advanceToOtpStep(user);
            await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

            const inputs = screen.getAllByRole('textbox');
            for (let i = 0; i < 6; i++) {
                await user.type(inputs[i], '1');
            }

            await waitFor(() => expect(onClose).toHaveBeenCalled());
            expect(mockToastSuccess).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ className: 'passkey-success-toast' })
            );

            const startCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([input]) => {
                const url = typeof input === 'string' ? input : (input as Request).url;
                return url.includes('passkey-start-registration');
            });
            const startBody = startCall?.[1]?.body as FormData;
            expect(startBody.get('nickName')).toBe('MacBook Pro');
        });

        it('does not show a success toast when suppressSuccessToast is true', async () => {
            const user = userEvent.setup();
            const credential = {
                id: 'cred-id',
                type: 'public-key',
                toJSON: () => ({ id: 'cred-id', type: 'public-key' }),
            };
            // Production gates both registration entry points on `parseCreationOptionsFromJSON`
            // being present, so the modal calls it directly. jsdom doesn't implement WebAuthn —
            // stub it as a pass-through that returns the options unchanged.
            vi.stubGlobal('PublicKeyCredential', {
                parseCreationOptionsFromJSON: (options: unknown) => options,
            });
            vi.stubGlobal('navigator', {
                ...navigator,
                credentials: { create: vi.fn().mockResolvedValue(credential) },
            });

            vi.spyOn(global, 'fetch').mockImplementation((input) => {
                const url = typeof input === 'string' ? input : (input as Request).url;
                if (url.includes('passkey-authorize-registration')) {
                    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
                }
                if (url.includes('passkey-start-registration')) {
                    return Promise.resolve(
                        new Response(JSON.stringify({ success: true, publicKey: { rp: { id: 'example.com' } } }), {
                            status: 200,
                        })
                    );
                }
                if (url.includes('passkey-finish-registration')) {
                    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
                }
                return Promise.resolve(new Response('{}', { status: 200 }));
            });

            const onClose = vi.fn();
            renderModal({ onClose, suppressSuccessToast: true }, { ...mockConfig, auth: { otpLength: 6 } });
            await advanceToOtpStep(user);
            await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

            const inputs = screen.getAllByRole('textbox');
            for (let i = 0; i < 6; i++) {
                await user.type(inputs[i], '1');
            }

            await waitFor(() => expect(onClose).toHaveBeenCalled());
            expect(mockToastSuccess).not.toHaveBeenCalled();
        });

        it('shows an error and does not call navigator.credentials.create when no rp.id entry matches the current hostname', async () => {
            const user = userEvent.setup();
            const createCredential = vi.fn();
            vi.stubGlobal('navigator', { ...navigator, credentials: { create: createCredential } });

            vi.spyOn(global, 'fetch').mockImplementation((input) => {
                const url = typeof input === 'string' ? input : (input as Request).url;
                if (url.includes('passkey-authorize-registration')) {
                    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
                }
                if (url.includes('passkey-start-registration')) {
                    return Promise.resolve(
                        new Response(
                            JSON.stringify({
                                success: true,
                                // Neither entry matches jsdom's default hostname ("localhost").
                                publicKey: { rp: { id: 'example.com,other.example.com' } },
                            }),
                            { status: 200 }
                        )
                    );
                }
                return Promise.resolve(new Response('{}', { status: 200 }));
            });

            const onClose = vi.fn();
            renderModal({ onClose }, { ...mockConfig, auth: { otpLength: 6 } });
            await advanceToOtpStep(user);
            await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

            const inputs = screen.getAllByRole('textbox');
            for (let i = 0; i < 6; i++) {
                await user.type(inputs[i], '1');
            }

            await waitFor(() => {
                expect(screen.getByText(/passkey creation failed/i)).toBeInTheDocument();
            });
            expect(createCredential).not.toHaveBeenCalled();
            expect(onClose).not.toHaveBeenCalled();
        });

        it('shows an error and does not close the modal when start-registration fails', async () => {
            const user = userEvent.setup();
            vi.spyOn(global, 'fetch').mockImplementation((input) => {
                const url = typeof input === 'string' ? input : (input as Request).url;
                if (url.includes('passkey-authorize-registration')) {
                    return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
                }
                if (url.includes('passkey-start-registration')) {
                    return Promise.resolve(new Response(JSON.stringify({ success: false }), { status: 200 }));
                }
                return Promise.resolve(new Response('{}', { status: 200 }));
            });

            const onClose = vi.fn();
            renderModal({ onClose }, { ...mockConfig, auth: { otpLength: 6 } });
            await advanceToOtpStep(user);
            await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

            const inputs = screen.getAllByRole('textbox');
            for (let i = 0; i < 6; i++) {
                await user.type(inputs[i], '1');
            }

            await waitFor(() => {
                expect(screen.getByText(/passkey creation failed/i)).toBeInTheDocument();
            });
            expect(onClose).not.toHaveBeenCalled();
        });
    });
});
