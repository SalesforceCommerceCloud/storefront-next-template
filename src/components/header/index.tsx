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
import { type ReactElement, type ReactNode, type PropsWithChildren, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router';
import { Link } from '@/components/link';
import Search from './search';
import CartBadge from './cart-badge';
import UserActions from './user-actions/user-actions';
import WishlistIcon from './wishlist-icon';
import { useTranslation } from 'react-i18next';
import logo from '/images/logo.svg';
import { Button } from '@/components/ui/button';
import { SparklesIcon } from '@/components/icons';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { openAgentWidget, isCimulateEnabled, validateCimulateConfig } from '@/components/cimulate';
import { UITarget } from '@/targets/ui-target';
import { Component } from '@/lib/decorators/component';
import { RegionDefinition } from '@/lib/decorators';

@Component('header', {
    name: 'Header',
    group: 'Layout',
    description: 'Global site header with navigation, search, and cart',
    embedded: true,
    component_id: 'header',
})
@RegionDefinition([{ id: 'announcement', name: 'Announcement', description: 'Displayed above the header' }])
export class HeaderMetadata {}

interface HeaderProps extends PropsWithChildren {
    beforeHeader?: ReactNode;
    /**
     * Slot rendered above the header's main row. Used for announcement banners
     * or other above-the-fold content that should sit at the top of the page.
     */
    announcementSlot?: ReactNode;
    variant?: 'full' | 'checkout';
}

// Isolates the `useLocation()` subscription so that route changes only re-render the Search component (via key reset)
// without cascading a re-render through the entire `Header` tree, which would unnecessarily re-render the navigation
// menu and other stable children.
function LocationKeyedSearch() {
    const location = useLocation();
    return <Search key={`${location.pathname}${location.search}`} />;
}

export default function Header({
    children,
    beforeHeader,
    announcementSlot,
    variant = 'full',
}: HeaderProps): ReactElement {
    const { t } = useTranslation('header');
    const headerRef = useRef<HTMLElement>(null);
    const config = useConfig();
    const showChat =
        variant === 'full' &&
        isCimulateEnabled(config.cimulateAgent?.enabled) &&
        validateCimulateConfig(config.cimulateAgent);
    const updateHeaderHeight = useCallback(() => {
        if (headerRef.current) {
            const height = `${headerRef.current.offsetHeight}px`;
            headerRef.current.style.setProperty('--header-height', height);
            document.documentElement.style.setProperty('--header-height', height);
        }
    }, []);

    useEffect(() => {
        const el = headerRef.current;
        if (!el) return;
        updateHeaderHeight();
        const observer = new ResizeObserver(updateHeaderHeight);
        observer.observe(el);
        return () => observer.disconnect();
    }, [updateHeaderHeight]);

    if (variant === 'checkout') {
        return (
            <header ref={headerRef} className="bg-header-background text-header-foreground sticky top-0 z-50">
                <div className="section-container">
                    <div className="flex items-center h-16">
                        <Link to="/" className="flex-shrink-0 flex items-center" data-testid="header-logo">
                            <img
                                src={logo}
                                alt={t('logoAlt')}
                                className="h-3 lg:h-4 w-auto [filter:var(--header-logo-filter)]"
                            />
                        </Link>
                        <div className="flex-1" />
                        <CartBadge />
                    </div>
                </div>
            </header>
        );
    }

    return (
        <header ref={headerRef} className="bg-header-background text-header-foreground sticky top-0 z-50">
            {announcementSlot}
            <div className="flex justify-end section-container">{beforeHeader}</div>
            <div className="section-container py-6">
                {/* Top row: Logo left, Icons right */}
                <div className="flex items-center gap-x-1 lg:gap-x-6">
                    {/* Logo - color swapped by theme via --header-logo-filter in app.css */}
                    <Link to="/" className="flex-shrink-0 flex items-center" data-testid="header-logo">
                        <img
                            src={logo}
                            alt={t('logoAlt')}
                            className="h-3 lg:h-4 w-auto [filter:var(--header-logo-filter)]"
                        />
                    </Link>

                    {/* Navigation Menu - desktop only, next to logo */}
                    <div className="hidden lg:flex items-center">{children}</div>

                    {/* Spacer - takes remaining space */}
                    <div className="flex-1" />

                    {/* Search - desktop only */}
                    <div className="hidden lg:block" data-testid="header-search-desktop">
                        <LocationKeyedSearch />
                    </div>

                    {/* Icons group - includes mobile hamburger */}
                    <div className="flex items-center">
                        <UITarget targetId="sfcc.header.before.cart" />
                        {showChat && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="cursor-pointer lg:px-4 px-1 text-header-foreground hover:bg-transparent hover:opacity-50 transition-opacity"
                                onClick={() => openAgentWidget()}
                                aria-label={t('openChat')}>
                                <SparklesIcon />
                            </Button>
                        )}
                        <UserActions />
                        <WishlistIcon />
                        <CartBadge />
                        <div className="lg:hidden">{children}</div>
                    </div>
                </div>

                {/* Mobile search - second row */}
                <div className="pb-4 lg:hidden" data-testid="header-search-mobile">
                    <LocationKeyedSearch />
                </div>
                <UITarget targetId="sfcc.header.bnpl.banner" />
            </div>
        </header>
    );
}
