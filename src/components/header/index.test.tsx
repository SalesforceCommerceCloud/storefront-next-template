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
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import 'reflect-metadata';
import Header, { HeaderMetadata } from './index';
import { getRegionDefinitions } from '@/lib/decorators/region-definition';
import { AllProvidersWrapper } from '@/test-utils/context-provider';

vi.mock('@/components/link', () => ({
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
        <a href={to} {...rest}>
            {children}
        </a>
    ),
}));

vi.mock('./search', () => ({
    default: () => <div data-testid="search" />,
}));

vi.mock('./cart-badge', () => ({
    default: () => <div data-testid="cart-badge" />,
}));

vi.mock('./user-actions/user-actions', () => ({
    default: () => <div data-testid="user-actions" />,
}));

vi.mock('@/components/cimulate', () => ({
    openAgentWidget: vi.fn(),
    isCimulateEnabled: vi.fn(() => false),
    validateCimulateConfig: vi.fn(() => false),
}));

vi.mock('@/targets/ui-target', () => ({
    UITarget: () => null,
}));

vi.mock('@/hooks/use-analytics', () => ({
    useAnalytics: () => ({ trackCommerceAgentEngagement: vi.fn() }),
}));

vi.mock('@salesforce/storefront-next-runtime/config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@salesforce/storefront-next-runtime/config')>();
    return {
        ...actual,
        useConfig: () => ({ cimulateAgent: { enabled: false } }),
    };
});

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

function renderHeader(ui: React.ReactElement) {
    return render(
        <MemoryRouter>
            <AllProvidersWrapper>{ui}</AllProvidersWrapper>
        </MemoryRouter>
    );
}

describe('Header', () => {
    describe('full variant (default)', () => {
        it('renders logo, search, user actions, and cart badge', () => {
            renderHeader(<Header />);
            expect(screen.getByTestId('header-logo')).toBeInTheDocument();
            expect(screen.getAllByTestId('search').length).toBeGreaterThan(0);
            expect(screen.getByTestId('user-actions')).toBeInTheDocument();
            expect(screen.getByTestId('cart-badge')).toBeInTheDocument();
        });

        it('renders children passed as navigation menu', () => {
            renderHeader(
                <Header>
                    <nav data-testid="nav-menu">menu</nav>
                </Header>
            );
            // Children render twice: desktop slot + mobile slot
            expect(screen.getAllByTestId('nav-menu').length).toBeGreaterThanOrEqual(1);
        });

        it('does not render an announcement slot when announcementSlot is omitted', () => {
            renderHeader(<Header />);
            expect(screen.queryByTestId('announcement-slot')).not.toBeInTheDocument();
        });

        it('renders the provided announcementSlot above the main row', () => {
            renderHeader(<Header announcementSlot={<div data-testid="announcement-slot">Announcement</div>} />);
            expect(screen.getByTestId('announcement-slot')).toBeInTheDocument();
        });
    });

    describe('checkout variant', () => {
        it('renders only logo and cart badge', () => {
            renderHeader(<Header variant="checkout" />);
            expect(screen.getByTestId('header-logo')).toBeInTheDocument();
            expect(screen.getByTestId('cart-badge')).toBeInTheDocument();
            expect(screen.queryByTestId('search')).not.toBeInTheDocument();
            expect(screen.queryByTestId('user-actions')).not.toBeInTheDocument();
        });

        it('does not render the announcement slot even when one is provided', () => {
            renderHeader(
                <Header variant="checkout" announcementSlot={<div data-testid="announcement-slot">Announcement</div>} />
            );
            expect(screen.queryByTestId('announcement-slot')).not.toBeInTheDocument();
        });
    });

    describe('beforeHeader slot', () => {
        it('renders beforeHeader content above the main header row', () => {
            renderHeader(<Header beforeHeader={<div data-testid="before-header">promo</div>} />);
            expect(screen.getByTestId('before-header')).toBeInTheDocument();
        });
    });
});

describe('HeaderMetadata', () => {
    it('declares a single announcement region', () => {
        const definitions = getRegionDefinitions(HeaderMetadata);
        expect(definitions).toHaveLength(1);
        expect(definitions[0].id).toBe('announcement');
        expect(definitions[0].name).toBe('Announcement');
    });
});
