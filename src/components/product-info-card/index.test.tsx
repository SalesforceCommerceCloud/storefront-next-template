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

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductInfoCard from './index';

describe('ProductInfoCard', () => {
    it('renders title and description', () => {
        render(<ProductInfoCard title="Estimated Delivery" description="5-7 business days" />);

        expect(screen.getByText('Estimated Delivery')).toBeInTheDocument();
        expect(screen.getByText('5-7 business days')).toBeInTheDocument();
    });

    it('renders action button with correct aria-label', async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();

        render(<ProductInfoCard title="Estimated Delivery" action={{ label: 'Learn More', onClick }} />);

        const button = screen.getByRole('button', { name: 'Learn More - Estimated Delivery' });
        expect(button).toBeInTheDocument();

        await user.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not render action button when action is not provided', () => {
        render(<ProductInfoCard title="Free Shipping" />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('does not render description when not provided', () => {
        render(<ProductInfoCard title="Free Returns" />);

        expect(screen.getByText('Free Returns')).toBeInTheDocument();
        expect(screen.queryByText(/shipping|delivery|business days/i)).not.toBeInTheDocument();
    });

    it('renders icon when provided', () => {
        render(<ProductInfoCard title="Delivery" icon={<span data-testid="test-icon">icon</span>} />);

        expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    it('renders the title as plain text by default', () => {
        render(<ProductInfoCard title="Estimated Delivery" />);

        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('renders the title as a heading when titleAs is set', () => {
        render(<ProductInfoCard title="Estimated Delivery" titleAs="h2" />);

        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Estimated Delivery');
    });
});
