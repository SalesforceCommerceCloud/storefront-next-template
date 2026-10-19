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
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import {
    DEFAULT_CAPABILITIES_VERSION,
    DEFAULT_WIDGET_SCRIPT_SRC,
    MAX_PDP_QUESTIONS,
    isEmbeddedAgentConfigured,
    isEmbeddedAgentEnabled,
    parsePdpQuestions,
} from '../index';

interface BarrelDocsProps {
    sampleRaw: string;
}

function BarrelDocs({ sampleRaw }: BarrelDocsProps) {
    const rows: Array<[string, string]> = [
        ['DEFAULT_WIDGET_SCRIPT_SRC', DEFAULT_WIDGET_SCRIPT_SRC],
        ['DEFAULT_CAPABILITIES_VERSION', DEFAULT_CAPABILITIES_VERSION],
        ['MAX_PDP_QUESTIONS', String(MAX_PDP_QUESTIONS)],
        ['isEmbeddedAgentEnabled("true")', String(isEmbeddedAgentEnabled('true'))],
        [
            'isEmbeddedAgentConfigured(empty)',
            String(
                isEmbeddedAgentConfigured({
                    enabled: true,
                    scrt2Url: '',
                    orgId: '',
                    esDeveloperName: '',
                })
            ),
        ],
        ['parsePdpQuestions(sample).length', String(parsePdpQuestions(sampleRaw).length)],
    ];
    return (
        <div data-testid="embedded-agent-barrel" className="space-y-2 text-sm">
            <h3 className="font-semibold">Embedded Agent — public barrel</h3>
            <p>
                Convenience re-exports from <code>@/components/embedded-agent</code>. The widget renders in the{' '}
                <em>Widget</em> story on the same page; this story just documents the barrel surface.
            </p>
            <table className="w-full max-w-xl table-auto border-collapse">
                <tbody>
                    {rows.map(([k, v]) => (
                        <tr key={k} className="border-b">
                            <th className="py-1 pr-4 text-left font-mono text-xs">{k}</th>
                            <td className="py-1 font-mono text-xs">{v}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const meta: Meta<typeof BarrelDocs> = {
    title: 'Commerce/Embedded Agent/Barrel',
    component: BarrelDocs,
    tags: ['autodocs'],
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Public surface of `@/components/embedded-agent`: the React widget wrapper plus pure helpers (`isEmbeddedAgentConfigured`, `parsePdpQuestions`, trusted-URL + script-src resolvers) and the `DEFAULT_*` / `MAX_PDP_QUESTIONS` constants. The widget itself is exercised in the Widget story — this story documents the barrel and smoke-tests the pure helpers.',
            },
        },
    },
    argTypes: {
        sampleRaw: {
            control: 'text',
            description: 'c_pdpQuestions raw string fed into parsePdpQuestions',
        },
    },
};

export default meta;
type Story = StoryObj<typeof BarrelDocs>;

export const Reference: Story = {
    name: 'Barrel reference — helpers + defaults',
    args: {
        sampleRaw: JSON.stringify(['How tall?', 'How tall?', '  Ships fast?  ', '']),
    },
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('embedded-agent-barrel')).toBeInTheDocument();
        // Dedupes + trims + rejects empties → 2 valid.
        await expect(canvas.getByText('parsePdpQuestions(sample).length')).toBeInTheDocument();
    },
};
