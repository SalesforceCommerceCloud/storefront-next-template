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
import { AiInsightCard } from './ai-insight-card';

describe('AiInsightCard', () => {
    it('renders review variant with title and description', () => {
        render(
            <AiInsightCard
                variant="review"
                title="AI Review Summary"
                description="Summary text"
                rating={4.5}
                reviewCount={100}
            />
        );
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('AI Review Summary');
        expect(screen.getByText('Summary text')).toBeInTheDocument();
    });

    it('renders custom title when provided', () => {
        render(
            <AiInsightCard
                variant="review"
                title="Custom Title"
                description="Summary text"
                rating={4}
                reviewCount={50}
            />
        );
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Custom Title');
    });

    it('renders the title as a non-heading when titleAs is set', () => {
        render(
            <AiInsightCard
                variant="review"
                title="AI Review Summary"
                titleAs="span"
                description="Summary text"
                rating={4}
                reviewCount={50}
            />
        );
        expect(screen.queryByRole('heading')).not.toBeInTheDocument();
        expect(screen.getByText('AI Review Summary')).toBeInTheDocument();
    });

    it('renders badge when badgeText is provided', () => {
        render(
            <AiInsightCard
                variant="review"
                title="AI Review Summary"
                badgeText="Beta"
                description="Summary"
                rating={4.5}
                reviewCount={10}
            />
        );
        expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    it('does not render badge when badgeText is not provided', () => {
        render(
            <AiInsightCard
                variant="review"
                title="AI Review Summary"
                description="Summary"
                rating={4.5}
                reviewCount={10}
            />
        );
        expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });

    it('displays rating with one decimal place', () => {
        render(<AiInsightCard variant="review" title="Summary" description="Summary" rating={4.56} reviewCount={20} />);
        expect(screen.getByText('4.6')).toBeInTheDocument();
    });

    it('displays review count in based-on label', () => {
        render(<AiInsightCard variant="review" title="Summary" description="Summary" rating={5} reviewCount={128} />);
        expect(screen.getByText(/128/)).toBeInTheDocument();
    });

    it('has data-testid ai-insight-card by default', () => {
        render(<AiInsightCard variant="review" title="Summary" description="Summary" rating={4} reviewCount={5} />);
        expect(screen.getByTestId('ai-insight-card')).toBeInTheDocument();
    });

    it('uses custom data-testid when provided', () => {
        render(
            <AiInsightCard
                variant="review"
                title="Summary"
                description="Summary"
                rating={4}
                reviewCount={5}
                data-testid="custom-ai-insight-card"
            />
        );
        expect(screen.getByTestId('custom-ai-insight-card')).toBeInTheDocument();
    });

    it('applies custom className', () => {
        render(
            <AiInsightCard
                variant="review"
                title="Summary"
                description="Summary"
                rating={4}
                reviewCount={5}
                className="custom-class"
            />
        );
        const wrapper = screen.getByTestId('ai-insight-card');
        expect(wrapper).toHaveClass('custom-class');
    });

    it('renders shoppingAssistant variant with title and description', () => {
        render(
            <AiInsightCard
                variant="shoppingAssistant"
                title="Shop with your Personal Assistant"
                description="I can help you find the perfect piece."
            />
        );
        expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Shop with your Personal Assistant');
        expect(screen.getByText('I can help you find the perfect piece.')).toBeInTheDocument();
        expect(screen.getByTestId('ai-insight-card')).toBeInTheDocument();
    });

    it('renders shoppingAssistant variant as button when onActionClick provided', () => {
        const onActionClick = vi.fn();
        render(
            <AiInsightCard
                variant="shoppingAssistant"
                title="Assistant"
                description="Help"
                onActionClick={onActionClick}
            />
        );
        const button = screen.getByRole('button', { name: 'Assistant' });
        expect(button).toBeInTheDocument();
        button.click();
        expect(onActionClick).toHaveBeenCalledTimes(1);
    });
});
