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
import type { Preview } from '@storybook/react-vite';
import { StoryShell, withRouter } from './decorators';
import '@/theme/index.css'; // Import global CSS — alias goes through vertical-first resolver

const a11yTestMode: 'off' | 'todo' | 'error' =
    process.env.STORYBOOK_DISABLE_A11Y === 'true'
        ? 'off'
        : process.env.STORYBOOK_A11Y_TEST_MODE === 'error'
          ? 'error'
          : 'todo';

const preview: Preview = {
    parameters: {
        options: {
            // Sidebar order. `order` fixes the top-level roots to the storefront's
            // domain taxonomy (roughly the shopper journey); `'*'` catches anything
            // not listed. `method: 'alphabetical'` sorts every deeper level
            // deterministically, so new stories slot in predictably without editing
            // this list. Docs entries always sort first within their group.
            storySort: {
                method: 'alphabetical',
                order: [
                    'Design System',
                    'Core',
                    'Content',
                    'Layout',
                    'Home',
                    'Products',
                    'Category',
                    'Search',
                    'Cart',
                    'Checkout',
                    'Account',
                    'Authentication',
                    'Extensions',
                    '*',
                ],
            },
        },

        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },

        a11y: {
            // 'error' - fail CI on a11y violations when explicitly enabled (e.g. a11y test command)
            // 'todo' - show a11y violations in the test UI only (default)
            // 'off' - skip a11y checks entirely for interaction-focused runs
            test: a11yTestMode,
        },
    },
    decorators: [withRouter(StoryShell)],
};

export default preview;
