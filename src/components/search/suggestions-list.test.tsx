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
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Suggestions from './suggestions-list';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import type { ReactNode } from 'react';

// Mock DynamicImage component
vi.mock('@/components/dynamic-image', () => ({
    DynamicImage: ({ src, alt, imageProps }: any) => <img src={src} alt={alt} {...imageProps} />,
}));

vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: () => ({
        trackClickSearchSuggestion: vi.fn(),
    }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
    <ConfigProvider config={mockConfig}>{children}</ConfigProvider>
);

describe('Suggestions Component', () => {
    const mockSuggestions = [
        { name: 'Electronics', link: '/category/electronics', type: 'category' },
        { name: 'Clothing', link: '/category/clothing', type: 'category' },
    ];

    it('should render nothing when suggestions are empty, null, or undefined', () => {
        const { container: emptyContainer } = render(<Suggestions suggestions={[]} />, { wrapper });
        expect(emptyContainer.querySelector('[data-testid="sf-suggestion"]')).toBeNull();

        const { container: nullContainer } = render(<Suggestions suggestions={null as any} />, { wrapper });
        expect(nullContainer.querySelector('[data-testid="sf-suggestion"]')).toBeNull();

        const { container: undefinedContainer } = render(<Suggestions suggestions={undefined} />, { wrapper });
        expect(undefinedContainer.querySelector('[data-testid="sf-suggestion"]')).toBeNull();
    });

    it('should render suggestions with correct content and structure', () => {
        render(<Suggestions suggestions={mockSuggestions} />, { wrapper });

        expect(screen.getByTestId('sf-suggestion')).toBeInTheDocument();
        expect(screen.getByText('Electronics')).toBeInTheDocument();
        expect(screen.getByText('Clothing')).toBeInTheDocument();
        expect(screen.getAllByRole('button')).toHaveLength(2);
    });

    it('should render images when provided and not render when missing', () => {
        const mixedSuggestions = [
            { name: 'Product with image', link: '/product/1', type: 'product', image: 'https://example.com/img.jpg' },
            { name: 'Category without image', link: '/category/1', type: 'category' },
        ];

        const { container } = render(<Suggestions suggestions={mixedSuggestions} />, { wrapper });

        // Product suggestion images are informative and use suggestion name alt text.
        const images = container.querySelectorAll('img');
        expect(images).toHaveLength(1);
        expect(images[0]).toHaveAttribute('alt', 'Product with image');
    });

    it('should call closeAndNavigate when clicked, or handle gracefully if undefined', () => {
        const mockCallback = vi.fn();
        const { rerender } = render(<Suggestions suggestions={mockSuggestions} closeAndNavigate={mockCallback} />, {
            wrapper,
        });

        fireEvent.click(screen.getByText('Electronics'));
        expect(mockCallback).toHaveBeenCalledWith('/category/electronics');

        // Should not crash without callback
        rerender(<Suggestions suggestions={mockSuggestions} closeAndNavigate={undefined} />);
        expect(() => fireEvent.click(screen.getByText('Clothing'))).not.toThrow();
    });

    it('should apply custom className', () => {
        render(<Suggestions suggestions={mockSuggestions} className="custom-class" />, { wrapper });
        expect(screen.getByTestId('sf-suggestion')).toHaveClass('custom-class');
    });
});
