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

import { useLayoutEffect, type ComponentType, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { expect } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { TurnstileWidget } from '../turnstile-widget';

type TurnstileRenderOptions = {
    sitekey: string;
    callback?: (token: string) => void;
    'error-callback'?: () => void;
    'expired-callback'?: () => void;
    appearance?: 'always' | 'execute' | 'interaction-only';
    execution?: 'render' | 'execute';
    theme?: 'light' | 'dark' | 'auto';
    size?: 'normal' | 'compact';
};

type TurnstileApi = {
    render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
    reset: (widgetId: string) => void;
    remove: (widgetId: string) => void;
    getResponse: (widgetId: string) => string;
};

function installTurnstileMock() {
    const w = window as Window & { turnstile?: TurnstileApi };
    const previous = w.turnstile;
    const existingScript = document.getElementById('turnstile-script');
    if (existingScript) {
        existingScript.remove();
    }
    w.turnstile = {
        render(_container, options) {
            queueMicrotask(() => {
                options.callback?.('mock-turnstile-token');
            });
            return 'mock-widget-id';
        },
        execute() {},
        reset() {},
        remove() {},
        getResponse() {
            return '';
        },
    };
    return () => {
        w.turnstile = previous;
        document.getElementById('turnstile-script')?.remove();
    };
}

function WithTurnstileMock({ Story }: { Story: ComponentType }): ReactElement {
    useLayoutEffect(() => {
        return installTurnstileMock();
    }, []);
    return <Story />;
}

const meta: Meta<typeof TurnstileWidget> = {
    title: 'Core/Security/Turnstile Widget',
    component: TurnstileWidget,
    decorators: [(Story) => <WithTurnstileMock Story={Story} />],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'Cloudflare Turnstile widget placeholder. Stories mock `window.turnstile` so the real script is not loaded. The visible delta of interest is enabled-vs-disabled — different modes (managed / non-interactive / invisible) render the same placeholder DOM under the mock.',
            },
        },
    },
    // Third-party widget host node uses role="presentation" in production; axe flags the placeholder.
    tags: ['autodocs', 'skip-a11y'],
    argTypes: {
        siteKey: { table: { disable: true } },
        onSuccess: { table: { disable: true } },
        onError: { table: { disable: true } },
        onExpire: { table: { disable: true } },
        onTimeout: { table: { disable: true } },
        onBypass: { table: { disable: true } },
        onRetryExhausted: { table: { disable: true } },
        resetRef: { table: { disable: true } },
        executeRef: { table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof TurnstileWidget>;

const SHARED_ARGS = {
    siteKey: '1x0000000000000000000000000000000AA',
    onSuccess: action('onSuccess'),
    onError: action('onError'),
    onExpire: action('onExpire'),
};

export const Default: Story = {
    args: SHARED_ARGS,
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const root = canvasElement.querySelector('[data-testid="turnstile-widget"]');
        await expect(root).toBeInTheDocument();
    },
};

/**
 * `enabled: false` — the component returns null. Locks in that the disable
 * branch doesn't accidentally render the widget host element.
 */
export const Disabled: Story = {
    args: { ...SHARED_ARGS, enabled: false },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        await expect(canvasElement.querySelector('[data-testid="turnstile-widget"]')).not.toBeInTheDocument();
    },
};
