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
import { AgentBannerView } from '@/components/trusted-agent/banner';

const meta = {
    title: 'Authentication/Trusted Agent/Session Banner',
    component: AgentBannerView,
    tags: ['autodocs', 'a11y', 'taob-entry'],
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Persistent represented-shopper and agent identity across storefront layouts, with explicit switch, recovery, and end controls.',
            },
        },
    },
    args: {
        customerId: 'abkHIYxekZlXkRxekYxqYYlKk0',
        loginId: 'shopper@example.com',
        agentId: 'support-agent',
        status: 'active',
        entryUrl: '/login/agent',
        endUrl: '/logout',
        contextChanged: false,
    },
    argTypes: {
        customerId: { control: 'text', description: 'The represented registered shopper identifier.' },
        loginId: { control: 'text', description: 'The represented shopper login, shown before the identifier.' },
        agentId: { control: 'text', description: 'The confirmed agent identifier.' },
        status: {
            control: 'radio',
            options: ['active', 'reauth-required'],
            description: 'Recovery replaces switching with an explicit Continue link.',
        },
        contextChanged: {
            control: 'boolean',
            description: 'Shows that another tab changed the authentication context.',
        },
        entryUrl: { table: { disable: true } },
        endUrl: { table: { disable: true } },
    },
} satisfies Meta<typeof AgentBannerView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const RecoveryRequired: Story = { args: { status: 'reauth-required' } };
export const WithoutLogin: Story = { args: { loginId: undefined } };
export const LongLogin: Story = {
    args: { loginId: 'a.very.long.shopper.login.name+taob.testing@example-subdomain.company.example.com' },
};
