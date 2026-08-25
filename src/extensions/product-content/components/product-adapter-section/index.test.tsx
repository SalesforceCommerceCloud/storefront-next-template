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
import ProductAdapterSection from '.';
import { mockConfig } from '@/test-utils/config';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => mockConfig,
}));

describe('ProductAdapterSection', () => {
    it('renders the resolved html content', () => {
        render(
            <ProductAdapterSection
                content={{
                    html: '<ul><li>Leather upper</li><li>Rubber outsole</li></ul>',
                    contentType: 'bulleted-list',
                }}
            />
        );
        expect(screen.getByText('Leather upper')).toBeInTheDocument();
        expect(screen.getByText('Rubber outsole')).toBeInTheDocument();
    });

    it('renders the fallback message when content is null', () => {
        render(<ProductAdapterSection content={null} />);
        expect(screen.getByText('Content coming soon.')).toBeInTheDocument();
    });

    it('renders plain-text content', () => {
        render(
            <ProductAdapterSection
                content={{ html: '<p>Condition leather regularly.</p>', contentType: 'plain-text' }}
            />
        );
        expect(screen.getByText('Condition leather regularly.')).toBeInTheDocument();
    });

    it('renders table content', () => {
        render(
            <ProductAdapterSection
                content={{
                    html: '<table><tr><td>Material</td><td>Leather</td></tr></table>',
                    contentType: 'table-2-column',
                }}
            />
        );
        expect(screen.getByText('Material')).toBeInTheDocument();
        expect(screen.getByText('Leather')).toBeInTheDocument();
    });

    it('dispatches spec-table content to the SpecTable renderer', () => {
        render(
            <ProductAdapterSection
                content={{
                    contentType: 'spec-table',
                    rows: [{ label: 'Width', values: { imperial: '84 in', metric: '213 cm' } }],
                    views: [
                        { id: 'imperial', label: 'Imperial' },
                        { id: 'metric', label: 'Metric' },
                    ],
                    defaultViewId: 'imperial',
                }}
            />
        );
        expect(document.querySelector('[data-slot="spec-table"]')).toBeInTheDocument();
        expect(screen.getByRole('radio', { name: 'Imperial' })).toBeInTheDocument();
        expect(screen.getByText('84 in')).toBeInTheDocument();
    });
});
