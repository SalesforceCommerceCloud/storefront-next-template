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
import { useEffect, type ReactElement } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { EmbeddedAgentWidget } from '../embedded-agent-widget';
import type { EmbeddedAgentConfig } from '../embedded-agent.utils';

const CUSTOM_ELEMENT = 'inline-agent-widget';

// Register a no-op custom element so the SUT's whenDefined() resolves without
// loading the real UMD. Each story resets the <head> script tag and the module
// cache; the element registry is global so we only define it once.
function ensureStubCustomElement(): void {
    if (customElements.get(CUSTOM_ELEMENT)) return;
    class InlineAgentWidgetStub extends HTMLElement {
        connectedCallback(): void {
            if (!this.shadowRoot) {
                const root = this.attachShadow({ mode: 'open' });
                const label = document.createElement('div');
                label.textContent = 'inline-agent-widget (stub)';
                label.style.cssText = 'padding:8px;border:1px dashed #888;font-family:system-ui;';
                root.appendChild(label);
            }
        }
    }
    customElements.define(CUSTOM_ELEMENT, InlineAgentWidgetStub);
}

interface StoryHostProps {
    config: EmbeddedAgentConfig;
    pdpQuestions?: string[];
    productName?: string;
}

function StoryHost({ config, pdpQuestions, productName }: StoryHostProps): ReactElement {
    useEffect(() => {
        ensureStubCustomElement();
    }, []);
    return (
        <div className="space-y-4" style={{ minWidth: 360 }}>
            <div data-testid="pdp-shell" className="rounded border p-4 text-sm">
                PDP right-column shell — the widget mounts below.
            </div>
            <EmbeddedAgentWidget config={config} pdpQuestions={pdpQuestions} productName={productName} />
        </div>
    );
}

const baseConfig: EmbeddedAgentConfig = {
    enabled: true,
    scrt2Url: 'https://scrt2.example.com',
    orgId: '00D000000000000',
    esDeveloperName: 'BYONCommerceClientAPI',
    persistSession: true,
    enableLogging: false,
};

const meta: Meta<typeof StoryHost> = {
    title: 'Commerce/Embedded Agent/Widget',
    component: StoryHost,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component: `
React wrapper that mounts the \`<inline-agent-widget>\` custom element (shipped as
a self-hosted UMD at \`/inline-agent-widget.umd.js\`) once per route and keeps its
attributes in sync with React props. Returns \`null\` until the config is fully
populated so merchants that leave the block empty get no mount at all. The widget
UMD is not loaded in Storybook; stories register a lightweight stub for
\`inline-agent-widget\` so the lifecycle (\`whenDefined\` → \`appendChild\` → attribute
sync) is observable without network traffic.
                `,
            },
        },
    },
    argTypes: {
        config: { control: 'object' },
        pdpQuestions: { control: 'object' },
        productName: { control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof StoryHost>;

export const Default: Story = {
    name: 'Mounted — attributes projected onto custom element',
    args: {
        config: baseConfig,
        pdpQuestions: ['How tall?', 'Does it ship fast?'],
        productName: 'Sample Product',
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('pdp-shell')).toBeInTheDocument();

        const host = canvas.getByTestId('embedded-agent-widget');
        await waitFor(() => {
            const el = host.querySelector(CUSTOM_ELEMENT);
            if (!el) throw new Error('custom element not mounted');
            expect(el.getAttribute('scrt2-url')).toBe(baseConfig.scrt2Url);
            expect(el.getAttribute('org-id')).toBe(baseConfig.orgId);
            expect(el.getAttribute('es-developer-name')).toBe(baseConfig.esDeveloperName);
            expect(el.getAttribute('product-name')).toBe('Sample Product');
            expect(JSON.parse(el.getAttribute('pdp-questions') ?? '[]')).toEqual(['How tall?', 'Does it ship fast?']);
        });
    },
};

export const NoPdpQuestions: Story = {
    name: 'No pdp-questions — attribute omitted',
    args: { config: baseConfig, productName: 'Sample Product' },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        const host = canvas.getByTestId('embedded-agent-widget');
        await waitFor(() => {
            const el = host.querySelector(CUSTOM_ELEMENT);
            if (!el) throw new Error('custom element not mounted');
            expect(el.hasAttribute('pdp-questions')).toBe(false);
        });
    },
};

export const NotConfigured: Story = {
    name: 'Missing scrt2Url — renders nothing',
    args: {
        config: { ...baseConfig, scrt2Url: '' },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('pdp-shell')).toBeInTheDocument();
        await expect(canvas.queryByTestId('embedded-agent-widget')).not.toBeInTheDocument();
    },
};

export const Disabled: Story = {
    name: 'Disabled flag — renders nothing',
    args: {
        config: { ...baseConfig, enabled: false },
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.queryByTestId('embedded-agent-widget')).not.toBeInTheDocument();
    },
};
