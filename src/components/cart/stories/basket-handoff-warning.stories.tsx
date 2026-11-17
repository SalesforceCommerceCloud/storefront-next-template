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
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import i18next from 'i18next';
import { Button } from '@/components/ui/button';
import { AppToaster, toast } from '@/components/toast';
import { BasketHandoffWarning } from '../basket-handoff-warning';

function WarningPreview({ withCookie }: { withCookie: boolean }) {
    const { site } = useSite();
    const [mount, setMount] = useState(0);
    return (
        <>
            <Button
                onClick={() => {
                    toast.dismiss();
                    document.cookie = `basket-handoff_${site.id}=${withCookie ? '1; Path=/' : '; Max-Age=0; Path=/'}`;
                    setMount((value) => value + 1);
                }}>
                Complete basket handoff
            </Button>
            <Button onClick={() => setMount((value) => value + 1)}>Revisit cart</Button>
            {mount > 0 && <BasketHandoffWarning key={mount} />}
            <AppToaster />
        </>
    );
}

const meta = {
    title: 'Cart/Basket Handoff Warning',
    component: BasketHandoffWarning,
    tags: ['autodocs'],
    args: { withCookie: true },
    argTypes: {
        withCookie: {
            control: 'boolean',
            description: 'An uncertain basket handoff sets a one-shot notification cookie. Successful handoffs do not.',
        },
    },
    parameters: {
        docs: {
            description: {
                component:
                    'Shows one notification after an uncertain login basket handoff, consuming the site-scoped cookie.',
            },
        },
    },
    render: (args) => <WarningPreview {...args} />,
} satisfies Meta<{ withCookie: boolean }>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
    tags: ['interaction'],
    play: async ({ canvasElement, args }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: 'Complete basket handoff' }));
        const message = i18next.t('cart:handoffWarning');
        if (args.withCookie)
            await waitFor(async () => await expect(within(document.body).getByText(message)).toBeVisible());
        else await expect(within(document.body).queryByText(message)).not.toBeInTheDocument();
        await expect(document.cookie).not.toMatch(/basket-handoff_[^=;]+=/);
        await userEvent.click(canvas.getByRole('button', { name: 'Revisit cart' }));
        await expect(within(document.body).queryAllByText(message)).toHaveLength(args.withCookie ? 1 : 0);
        toast.dismiss();
    },
};
