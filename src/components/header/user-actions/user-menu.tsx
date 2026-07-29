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
import { type ReactElement, useState, useRef, useEffect } from 'react';
import { Form } from 'react-router';
import { useTranslation } from 'react-i18next';
import { House, Heart, ShoppingBag, User, MapPin, CreditCard, Building, KeyRound, LogOut } from 'lucide-react';

// Runtime SDK
import { buildUrl } from '@salesforce/storefront-next-runtime/site-context';

// Components
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// hooks
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';

// Lib
import { cn } from '@/lib/utils';
import { routes } from '@/route-paths';

interface UserMenuProps {
    isAuthenticated: boolean;
    trigger: ReactElement;
}

// Common className for menu item links
const menuItemClassName = cn(
    'flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground ',
    'hover:bg-muted/50 transition-colors',
    'outline-none focus-visible:bg-muted focus-visible:text-popover-foreground'
);

export function UserMenu({ isAuthenticated, trigger }: UserMenuProps): ReactElement {
    const [open, setOpen] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const openedViaMouseRef = useRef(false);
    const { t } = useTranslation('header');
    const { t: tAccount } = useTranslation('account');
    const config = useConfig();
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();
    const passkeyEnabled = Boolean(config.features?.passkey?.enabled);

    // Clear timeout on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const handleMouseEnter = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        openedViaMouseRef.current = true;
        setOpen(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setOpen(false);
        }, 150); // Small delay to allow moving from trigger to content
    };

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen);
        if (!newOpen) {
            if (openedViaMouseRef.current) {
                // Blur trigger when closing via mouse to prevent focus ring
                requestAnimationFrame(() => {
                    const activeElement = document.activeElement as HTMLElement;
                    if (activeElement?.closest('[data-slot="popover-trigger"]')) {
                        activeElement.blur();
                    }
                });
            }
            openedViaMouseRef.current = false;
        }
    };

    const handleOpenAutoFocus = (e: Event) => {
        if (openedViaMouseRef.current) {
            e.preventDefault();
        }
    };

    const handleCloseAutoFocus = (e: Event) => {
        if (openedViaMouseRef.current) {
            e.preventDefault();
        }
    };

    const handleMenuItemMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
        e.currentTarget.focus();
    };

    // Common Popover props
    const popoverContentProps = {
        className: 'w-64 p-0 overflow-hidden bg-background border-border',
        align: 'end' as const,
        sideOffset: 8,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onOpenAutoFocus: handleOpenAutoFocus,
        onCloseAutoFocus: handleCloseAutoFocus,
    };

    if (isAuthenticated) {
        return (
            <Popover open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                    {trigger}
                </PopoverTrigger>
                <PopoverContent {...popoverContentProps}>
                    <div className="py-2">
                        {/* YOUR LISTS Section */}
                        <div className="px-4 py-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                {t('menu.yourLists')}
                            </h3>
                            <div className="space-y-1">
                                <Link
                                    to={routes.accountWishlist}
                                    className={menuItemClassName}
                                    onMouseEnter={handleMenuItemMouseEnter}>
                                    <Heart className="h-5 w-5" />
                                    {tAccount('navigation.wishlist')}
                                </Link>
                            </div>
                        </div>

                        {/* Separator */}
                        <div className="border-t border-border my-2" />

                        {/* YOUR ACCOUNT Section */}
                        <div className="px-4 py-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                {t('menu.yourAccount')}
                            </h3>
                            <div className="space-y-1">
                                <Link
                                    to={routes.accountOverview}
                                    className={menuItemClassName}
                                    onMouseEnter={handleMenuItemMouseEnter}>
                                    <House className="h-5 w-5" />
                                    {tAccount('navigation.overview')}
                                </Link>
                                <Link
                                    to={routes.account}
                                    className={menuItemClassName}
                                    onMouseEnter={handleMenuItemMouseEnter}>
                                    <User className="h-5 w-5" />
                                    {tAccount('navigation.accountDetails')}
                                </Link>
                                <Link
                                    to={routes.accountOrders}
                                    className={menuItemClassName}
                                    onMouseEnter={handleMenuItemMouseEnter}>
                                    <ShoppingBag className="h-5 w-5" />
                                    {tAccount('navigation.orderHistory')}
                                </Link>
                                <Link
                                    to={routes.accountAddresses}
                                    className={menuItemClassName}
                                    onMouseEnter={handleMenuItemMouseEnter}>
                                    <MapPin className="h-5 w-5" />
                                    {t('menu.addressBook')}
                                </Link>
                                <Link
                                    to={routes.accountPaymentMethods}
                                    className={menuItemClassName}
                                    onMouseEnter={handleMenuItemMouseEnter}>
                                    <CreditCard className="h-5 w-5" />
                                    {t('menu.paymentMethods')}
                                </Link>
                                {passkeyEnabled && (
                                    <Link
                                        to={routes.accountPasskeys}
                                        className={menuItemClassName}
                                        onMouseEnter={handleMenuItemMouseEnter}>
                                        <KeyRound className="h-5 w-5" aria-hidden="true" />
                                        {tAccount('navigation.passkeys')}
                                    </Link>
                                )}
                                <Link
                                    to={routes.accountStorePreferences}
                                    className={menuItemClassName}
                                    onMouseEnter={handleMenuItemMouseEnter}>
                                    <Building className="h-5 w-5" />
                                    {tAccount('navigation.storePreferences')}
                                </Link>
                            </div>
                        </div>

                        {/* Separator */}
                        <div className="border-t border-border my-2" />

                        {/* Logout */}
                        <div className="px-4 py-2">
                            <Form
                                method="post"
                                action={buildUrl({
                                    to: '/logout',
                                    urlConfig: config.url,
                                    params: { siteId: siteRef, localeId: localeRef },
                                })}
                                className="w-full">
                                <button
                                    type="submit"
                                    data-testid="user-menu-logout"
                                    className={cn(menuItemClassName, 'w-full text-left cursor-pointer')}
                                    onMouseEnter={handleMenuItemMouseEnter}>
                                    <LogOut className="h-5 w-5" />
                                    {tAccount('navigation.logOut')}
                                </button>
                            </Form>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        );
    }

    // Guest user menu
    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                {trigger}
            </PopoverTrigger>
            <PopoverContent {...popoverContentProps}>
                <div className="p-4 bg-muted/50 ">
                    <p className="text-sm text-muted-foreground mb-4">{t('menu.signInForBestExperience')}</p>
                    <Button asChild className="w-full mb-3 ">
                        <Link to={routes.login} onMouseEnter={handleMenuItemMouseEnter}>
                            {t('signIn')}
                        </Link>
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                        {t('menu.newCustomer')}{' '}
                        <Link
                            to={routes.signup}
                            className={cn(
                                'text-popover-foreground hover:underline px-1 py-0.5',
                                'outline-none focus-visible:bg-muted focus-visible:text-popover-foreground'
                            )}
                            onMouseEnter={handleMenuItemMouseEnter}>
                            {t('menu.createAccount')}
                        </Link>
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    );
}
