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
import { OrderLookupErrorMessage } from '../error-message';

const meta: Meta<typeof OrderLookupErrorMessage> = {
    title: 'Components/Order Lookup/Error Message',
    component: OrderLookupErrorMessage,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof OrderLookupErrorMessage>;

export const Validation: Story = {
    args: {
        code: 'VALIDATION',
    },
};

export const TurnstileFailed: Story = {
    args: {
        code: 'TURNSTILE_FAILED',
    },
};

export const RateLimited: Story = {
    args: {
        code: 'RATE_LIMITED',
    },
};

export const RateLimitedWithCountdown: Story = {
    args: {
        code: 'RATE_LIMITED',
        retryAfterSeconds: 30,
    },
};

export const InvalidCode: Story = {
    args: {
        code: 'INVALID_CODE',
    },
};

export const AttemptsExceeded: Story = {
    args: {
        code: 'ATTEMPTS_EXCEEDED',
        onRequestNewCode: fn(),
    },
};

export const ScapiUnsupported: Story = {
    args: {
        code: 'SCAPI_UNSUPPORTED',
    },
};

export const RequestFailed: Story = {
    args: {
        code: 'REQUEST_FAILED',
    },
};

export const LookupFailed: Story = {
    args: {
        code: 'LOOKUP_FAILED',
    },
};

export const FeatureDisabled: Story = {
    args: {
        code: 'FEATURE_DISABLED',
    },
};

export const UnknownError: Story = {
    args: {
        code: 'UNKNOWN_ERROR_CODE',
    },
};

export const SubmitBlocking: Story = {
    args: {
        code: 'VALIDATION',
        submitBlocking: true,
    },
};
