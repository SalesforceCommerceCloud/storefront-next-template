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
import { fn } from 'storybook/test';
import { AiInsightCard } from '../ai-insight-card';

/**
 * `AiInsightCard` is an AI-assisted insight card with two visually distinct variants:
 *
 * - `variant="review"` — light card with an AI review-summary and a rating line. Rendered in the
 *   Customer Reviews section when an `aiSummary` is present.
 * - `variant="shoppingAssistant"` — dark card with a forward arrow, optionally clickable. Rendered
 *   on the search page to launch the shopper agent.
 *
 * Use the **Playground** to flip every visible prop from Controls; the dedicated `ReviewSummary`
 * and `ShoppingAssistant` stories bookmark the two production shapes.
 */
const meta: Meta<typeof AiInsightCard> = {
    title: 'Core/Data Display/AI Insight Card',
    component: AiInsightCard,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component:
                    'AI insight card with `review` (light, with rating) and `shoppingAssistant` (dark, optionally clickable) variants. The `compact` flag tightens padding for dense contexts such as the search dropdown.',
            },
        },
    },
    argTypes: {
        variant: {
            description: '`review` (light card + rating line) or `shoppingAssistant` (dark card + arrow).',
            control: 'select',
            options: ['review', 'shoppingAssistant'],
        },
        title: { description: 'Card heading.', control: 'text' },
        description: { description: 'Body text. Long copy wraps and grows the card height.', control: 'text' },
        badgeText: { description: 'Optional badge beside the title (e.g. "Beta"). Empty hides it.', control: 'text' },
        compact: {
            description: 'Tighter padding + smaller icon for dense contexts (e.g. search dropdown).',
            control: 'boolean',
        },
        rating: {
            description: '`review` variant only — average rating shown in the rating line.',
            control: { type: 'number', min: 0, max: 5, step: 0.1 },
        },
        reviewCount: {
            description: '`review` variant only — count shown in the "based on N reviews" label.',
            control: { type: 'number', min: 0 },
        },
        // Handler — not editable in Controls.
        onActionClick: { table: { disable: true } },
        // Plumbing — designer-unfriendly / no visible change.
        className: { table: { disable: true } },
        'data-testid': { table: { disable: true } },
    },
};

export default meta;

type Story = StoryObj<typeof AiInsightCard>;

/**
 * Controls-driven entry point. Defaults to a rich review summary; flip `variant`, `compact`,
 * `badgeText`, rating, and copy from the panel. (`ReviewShortSummary` and `ReviewNoBadge` are
 * reachable here by shortening `description` / clearing `badgeText`.)
 */
export const Playground: Story = {
    args: {
        variant: 'review',
        title: 'AI Review Summary',
        badgeText: 'Beta',
        description:
            'Customers love the comfort and fit of these shoes. Many mention they run true to size and are great for all-day wear. The style and quality receive consistent praise.',
        rating: 4.5,
        reviewCount: 128,
        compact: false,
    },
};

/**
 * The review-summary shape rendered in the Customer Reviews section (light card, rating line,
 * "Beta" badge). Matches the `customer-reviews-section` call site.
 */
export const ReviewSummary: Story = {
    args: {
        variant: 'review',
        title: 'AI Review Summary',
        badgeText: 'Beta',
        description:
            'Customers love the comfort and fit of these shoes. Many mention they run true to size and are great for all-day wear.',
        rating: 4.5,
        reviewCount: 128,
    },
};

/**
 * The shopper-agent shape rendered on the search page (dark, clickable, `compact`). Matches the
 * `search/suggestions` call site. Clickable variant renders as a `<button>`.
 */
export const ShoppingAssistant: Story = {
    args: {
        variant: 'shoppingAssistant',
        compact: true,
        title: 'Shop with your Personal Assistant',
        description: 'I can help you find the perfect piece for your space. Shop with me.',
        onActionClick: fn(),
    },
};
