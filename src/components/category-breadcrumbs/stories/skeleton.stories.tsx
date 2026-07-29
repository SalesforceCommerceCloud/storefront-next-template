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
import { CategoryBreadcrumbsSkeleton } from '../skeleton';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';

const meta: Meta<typeof CategoryBreadcrumbsSkeleton> = {
    title: 'Category/Category Breadcrumbs Skeleton',
    component: CategoryBreadcrumbsSkeleton,
    tags: ['autodocs', 'interaction'],
    parameters: {
        layout: 'padded',
    },
};

export default meta;
type Story = StoryObj<typeof CategoryBreadcrumbsSkeleton>;

export const Default: Story = {
    args: {},
    play: async ({ canvasElement }) => {
        await waitForStorybookReady(canvasElement);
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId('breadcrumbs-skeleton')).toBeInTheDocument();
        await expect(canvas.getByLabelText('Breadcrumb')).toBeInTheDocument();
    },
};
