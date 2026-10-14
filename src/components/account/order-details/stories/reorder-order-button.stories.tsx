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
import { createMemoryRouter, RouterProvider, useInRouterContext } from 'react-router';
import { ReorderOrderButton } from '../reorder-order-button';
import { ConfigWrapper } from '@/test-utils/config';

const meta: Meta<typeof ReorderOrderButton> = {
    title: 'Account/Orders/Order Details/Reorder Order Button',
    component: ReorderOrderButton,
    parameters: {
        layout: 'padded',
        docs: {
            description: {
                component:
                    'Full-width "Reorder this order" button shown in the Order Details right rail. Submits a POST to the cart-reorder action with `quantityMode=available`. Shows a loading state while the request is in-flight.',
            },
        },
    },
    tags: ['autodocs'],
    decorators: [
        (Story) => {
            const inRouter = useInRouterContext();
            const content = (
                <ConfigWrapper>
                    <Story />
                </ConfigWrapper>
            );

            if (inRouter) return content;

            const router = createMemoryRouter([{ path: '*', element: content }], { initialEntries: ['/'] });
            return <RouterProvider router={router} />;
        },
    ],
    argTypes: {
        orderNo: { control: 'text' },
    },
};

export default meta;
type Story = StoryObj<typeof ReorderOrderButton>;

export const Default: Story = {
    args: {
        orderNo: '00166274',
    },
};
