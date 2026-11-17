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
import { useLayoutEffect, useState, type ReactElement } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { stripPathPrefix, useSite } from '@salesforce/storefront-next-runtime/site-context';
import { Button } from '@/components/ui/button';
import { SelectedStoreBoundary, useStoreLocator } from '@/extensions/store-locator/providers/store-locator';
import type { SelectedStoreInfo } from '@/extensions/store-locator/stores/store-locator-store';
import {
    isHomeStorePromptDismissed,
    serializeHomeStorePromptDismissalCookie,
} from '@/extensions/store-locator/home-store-prompt-dismissal';

/**
 * Home-only store selection prompt. Dismissing it is limited to the current
 * browser session; selecting a store hides it everywhere immediately.
 */
export default function HomeStorePrompt(): ReactElement | null {
    const { t } = useTranslation('extStoreLocator');
    const { pathname } = useLocation();
    const config = useConfig();
    const { site } = useSite();
    const currentSelection = useStoreLocator((state) => state.selectedStoreInfo);
    const rootDismissed = useStoreLocator((state) => state.homeStorePromptDismissed);
    const setHomeStorePromptDismissed = useStoreLocator((state) => state.setHomeStorePromptDismissed);
    const isOpen = useStoreLocator((state) => state.isOpen);
    const openStoreLocator = useStoreLocator((state) => state.open);
    const [isDismissed, setIsDismissed] = useState(rootDismissed);

    // The framework duplicates the root index route for the bare homepage and
    // registers the configured site/locale prefix as the storefront home route.
    const pathWithoutPrefix = stripPathPrefix({ pathname, prefix: config.url?.prefix ?? '' });
    const isHomeRoute = pathname === '/' || (config.url?.prefix !== '/' && pathWithoutPrefix === '');

    useLayoutEffect(() => {
        try {
            const dismissed = rootDismissed || isHomeStorePromptDismissed(document.cookie, site.id);
            setIsDismissed(dismissed);
            setHomeStorePromptDismissed(dismissed);
        } catch {
            setIsDismissed(rootDismissed);
            setHomeStorePromptDismissed(rootDismissed);
        }
    }, [rootDismissed, setHomeStorePromptDismissed, site.id]);

    const dismiss = () => {
        try {
            document.cookie = serializeHomeStorePromptDismissalCookie({
                siteId: site.id,
                cookieDomain: site.cookies?.domain || config.cookies?.domain,
                secure: window.location.protocol === 'https:',
            });
        } catch {
            // Cookie writes can be unavailable in private browsing contexts.
        }
        setIsDismissed(true);
        setHomeStorePromptDismissed(true);
    };

    if (!isHomeRoute || isDismissed || rootDismissed || currentSelection) {
        return null;
    }

    const prompt = (selection?: SelectedStoreInfo | null) =>
        selection ? null : (
            <section
                aria-labelledby="store-locator-home-prompt-heading"
                className="border-b border-border bg-muted text-foreground"
                data-testid="store-locator-home-prompt">
                <div className="section-container flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                        <h2 id="store-locator-home-prompt-heading" className="text-sm font-semibold">
                            {t('storeLocator.homePrompt.title')}
                        </h2>
                        <p className="text-sm text-muted-foreground">{t('storeLocator.homePrompt.description')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => openStoreLocator()}
                            aria-haspopup="dialog"
                            aria-expanded={isOpen}>
                            {t('storeLocator.homePrompt.open')}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
                            {t('storeLocator.homePrompt.dismiss')}
                        </Button>
                    </div>
                </div>
            </section>
        );
    return (
        <SelectedStoreBoundary errorFallback={<></>} fallback={<div className="h-36 lg:h-20" aria-hidden="true" />}>
            {prompt}
        </SelectedStoreBoundary>
    );
}
