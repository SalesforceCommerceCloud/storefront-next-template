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
import ResponsiveNavigationMenu from '../responsive-navigation-menu';
import { mockMegaMenuRootCategory, mockMegaMenuSubCategories } from './mock-menu-data';

const desktopViewport = {
    name: 'Desktop',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop' as const,
};

const meta: Meta<typeof ResponsiveNavigationMenu> = {
    title: 'Layout/Navigation/Responsive Navigation Menu',
    component: ResponsiveNavigationMenu,
    parameters: {
        layout: 'fullscreen',
        viewport: {
            options: { desktop: desktopViewport },
            value: 'desktop',
            isRotated: false,
        },
        docs: {
            description: {
                component: 'Shared responsive mega-menu engine used by vertical-specific navigation wrappers.',
            },
        },
    },
    argTypes: {
        resolve: { table: { disable: true } },
        defer: { table: { disable: true } },
        embeddedComponent: { table: { disable: true } },
        regionIds: { table: { disable: true } },
        portalSlots: { table: { disable: true } },
        categoryFilter: { table: { disable: true } },
        hasBanner: { table: { disable: true } },
        utilityContent: { table: { disable: true } },
    },
    args: {
        resolve: Promise.resolve(mockMegaMenuRootCategory),
        defer: Promise.resolve(mockMegaMenuSubCategories),
        regionIds: new Set(),
    },
    decorators: [
        (Story) => (
            <div style={{ ['--header-height' as never]: '72px' }}>
                <div className="relative z-50 flex h-[72px] items-center bg-header-background px-8 text-header-foreground shadow-sm">
                    <Story />
                </div>
                <div className="min-h-[520px] bg-background" aria-hidden />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ResponsiveNavigationMenu>;

export const Default: Story = {};
