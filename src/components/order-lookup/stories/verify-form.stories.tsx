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
import { fn } from 'storybook/test';
import { VerifyForm } from '../verify-form';
import type { VerifyOrderResponse } from '@/routes/action.order-lookup-verify';

const meta = {
    title: 'Components/Order Lookup/Verify Form',
    component: VerifyForm,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    args: {
        orderNumber: 'TEST123456',
        email: 'guest@example.com',
        onVerified: fn(),
    },
} satisfies Meta<typeof VerifyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    parameters: {
        reactRouter: {
            mocks: {
                useFetcher: () => ({
                    data: undefined,
                    state: 'idle',
                    submit: () => {},
                }),
            },
        },
    },
};

export const WithCancel: Story = {
    args: {
        onCancel: fn(),
    },
    parameters: {
        reactRouter: {
            mocks: {
                useFetcher: () => ({
                    data: undefined,
                    state: 'idle',
                    submit: () => {},
                }),
            },
        },
    },
};

export const Submitting: Story = {
    parameters: {
        reactRouter: {
            mocks: {
                useFetcher: () => ({
                    data: undefined,
                    state: 'submitting',
                    submit: () => {},
                }),
            },
        },
    },
};

export const InvalidCodeError: Story = {
    parameters: {
        reactRouter: {
            mocks: {
                useFetcher: () => ({
                    data: {
                        ok: false,
                        code: 'INVALID_CODE',
                        message: 'Invalid verification code',
                    } as VerifyOrderResponse,
                    state: 'idle',
                    submit: () => {},
                }),
            },
        },
    },
};

export const RateLimited: Story = {
    parameters: {
        reactRouter: {
            mocks: {
                useFetcher: () => ({
                    data: {
                        ok: false,
                        code: 'RATE_LIMITED',
                        retryAfterSeconds: 30,
                        message: 'Too many requests',
                    } as VerifyOrderResponse,
                    state: 'idle',
                    submit: () => {},
                }),
            },
        },
    },
};

export const AttemptsExceeded: Story = {
    args: {
        onCancel: fn(),
    },
    parameters: {
        reactRouter: {
            mocks: {
                useFetcher: () => ({
                    data: {
                        ok: false,
                        code: 'ATTEMPTS_EXCEEDED',
                        message: 'Maximum verification attempts exceeded',
                    } as VerifyOrderResponse,
                    state: 'idle',
                    submit: () => {},
                }),
            },
        },
    },
};

export const ValidationError: Story = {
    parameters: {
        reactRouter: {
            mocks: {
                useFetcher: () => ({
                    data: {
                        ok: false,
                        code: 'VALIDATION',
                        field: 'code',
                        message: 'Invalid code',
                    } as VerifyOrderResponse,
                    state: 'idle',
                    submit: () => {},
                }),
            },
        },
    },
};

export const ThreeAttemptsHint: Story = {
    args: {
        onCancel: fn(),
    },
    parameters: {
        reactRouter: {
            mocks: {
                useFetcher: () => ({
                    data: undefined,
                    state: 'idle',
                    submit: () => {},
                }),
            },
        },
    },
};
