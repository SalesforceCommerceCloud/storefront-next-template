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
import type { ReactElement } from 'react';
import { Form } from '@/components/form';
import type { LucideIcon } from 'lucide-react';

// Runtime SDK
import { buildUrl } from '@salesforce/storefront-next-runtime/site-context';

// Components
import { NavLink } from '@/components/link';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AccountNavItemProps {
    item: {
        path: string;
        icon: LucideIcon;
        label: string;
        disabled?: boolean;
        end?: boolean;
        action?: string;
        method?: 'post' | 'get';
    };
    isMobile?: boolean;
}

export function AccountNavItem({ item, isMobile = false }: AccountNavItemProps): ReactElement {
    const config = useConfig();
    const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();
    const Icon = item.icon;
    const baseClasses =
        'w-full px-3 py-2 text-left text-sm font-normal leading-none flex items-center justify-start gap-2 overflow-hidden text-ellipsis whitespace-nowrap text-sidebar-foreground';
    const mobileClasses = `${baseClasses} border`;
    const disabledClasses = 'opacity-50 cursor-not-allowed pointer-events-none';

    if (item.disabled) {
        return (
            <Button
                className={cn(isMobile ? mobileClasses : baseClasses, disabledClasses, 'text-muted-foreground')}
                disabled
                variant="ghost"
                size="sm">
                <Icon data-testid={`${item.label}-icon`} className="h-5 w-5" />
                {item.label}
            </Button>
        );
    }

    // If item has an action, render as a form (e.g., for logout)
    if (item.action) {
        const activeClasses = isMobile
            ? 'bg-transparent hover:text-sidebar-foreground hover:bg-sidebar-accent'
            : 'hover:text-sidebar-foreground hover:bg-sidebar-accent';
        const action = buildUrl({
            to: item.action,
            urlConfig: config.url,
            params: { siteId: siteRef, localeId: localeRef },
        });
        return (
            <Form method={item.method || 'post'} action={action} className="w-full">
                <button
                    type="submit"
                    className={cn(isMobile ? mobileClasses : baseClasses, activeClasses, 'cursor-pointer')}>
                    <Icon data-testid={`${item.label}-icon`} className="h-5 w-5" />
                    {item.label}
                </button>
            </Form>
        );
    }

    return (
        <NavLink
            key={item.path}
            to={item.path}
            end={item.end ?? false}
            className={({ isActive }) =>
                cn(
                    isMobile ? mobileClasses : baseClasses,
                    isActive
                        ? 'bg-sidebar-accent'
                        : isMobile
                          ? 'bg-transparent hover:text-sidebar-foreground hover:bg-sidebar-accent'
                          : 'hover:text-sidebar-foreground hover:bg-sidebar-accent'
                )
            }>
            <Icon data-testid={`${item.label}-icon`} className="h-5 w-5" />
            {item.label}
        </NavLink>
    );
}
