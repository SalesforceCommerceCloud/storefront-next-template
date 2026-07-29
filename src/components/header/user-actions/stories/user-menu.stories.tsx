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
import { User } from 'lucide-react';
import { UserMenu } from '../user-menu';
import { Button } from '@/components/ui/button';

const meta: Meta<typeof UserMenu> = {
    title: 'Layout/Header/User Menu',
    component: UserMenu,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'A popover menu that shows account links for authenticated users or sign-in/create-account prompts for guests.',
            },
        },
    },
};

export default meta;
type Story = StoryObj<typeof UserMenu>;

const AccountTrigger = (
    <Button variant="ghost" size="icon" aria-label="My Account">
        <User className="h-5 w-5" />
    </Button>
);

export const Guest: Story = {
    args: {
        isAuthenticated: false,
        trigger: AccountTrigger,
    },
};

export const Authenticated: Story = {
    args: {
        isAuthenticated: true,
        trigger: AccountTrigger,
    },
};
