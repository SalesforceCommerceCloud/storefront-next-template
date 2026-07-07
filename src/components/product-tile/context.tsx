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
import { createContext, type PropsWithChildren, useCallback, useContext, useMemo } from 'react';
import type { NavigateFunction } from 'react-router';
import { useNavigate } from '@/hooks/use-navigate';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import defaultTheme from 'tailwindcss/defaultTheme';
import type { ShopperSearch } from '@/scapi';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import type { AppConfig, BadgeDetail } from '@/types/config';
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { getProductBadges } from '@/lib/product/product-badges';

type ProductBadgesResult = { badges: BadgeDetail[]; hasBadges: boolean };

interface ProductTileContextValue {
    navigate: NavigateFunction;
    config: AppConfig;
    t: TFunction<'product'>;
    currency?: string;
    getBadges: (product: ShopperSearch.schemas['ProductSearchHit']) => ProductBadgesResult;
}

const ProductTileContext = createContext<ProductTileContextValue | null>(null);

const DESKTOP_QUERY = `(min-width: ${defaultTheme.screens.lg})`;

/**
 * Whether the viewport is at or above tailwind's `lg` breakpoint (desktop device). Read this at event time (e.g. from a
 * swatch-hover handler), never during render: it depends on `matchMedia`, which is unavailable during SSR and returns a
 * different value on the client, so reading it while rendering causes a hydration mismatch and a post-hydration
 * re-render. On the server (no `matchMedia`) it returns `false`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function isDesktopViewport(): boolean {
    return globalThis.matchMedia?.(DESKTOP_QUERY)?.matches ?? false;
}

/**
 * Provider that initializes shared hooks once for all product tiles, e.g., displayed in a product grid.
 * This reduces hydration overhead by avoiding repeated hook initialization for each tile,
 * (e.g., 24 tiles = 96x hook calls reduced to 24x context hook calls + the hooks in the provider).
 */
export function ProductTileProvider({ children }: PropsWithChildren) {
    const navigate = useNavigate();
    const config = useConfig();
    const { t } = useTranslation('product');
    const { currency } = useSite();
    const getBadges = useCallback(
        (product: ShopperSearch.schemas['ProductSearchHit']) =>
            getProductBadges({ product, badgeDetails: config.global.badges, maxBadges: 2 }),
        [config.global.badges]
    );
    // Memoize the value so its reference changes only when a field consumers read actually changes. Without this,
    // every provider re-render mints a new object and re-renders every tile in the grid regardless of what changed.
    const value = useMemo(
        () => ({ navigate, config, t, currency, getBadges }),
        [navigate, config, t, currency, getBadges]
    );

    return <ProductTileContext.Provider value={value}>{children}</ProductTileContext.Provider>;
}

/**
 * Hook that returns context if available, otherwise falls back to direct hook calls.
 * This allows ProductTile to work both inside and outside ProductTileProvider.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useProductTileContext(): ProductTileContextValue {
    const context = useContext(ProductTileContext);
    if (context) {
        return context;
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const config = useConfig();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const navigate = useNavigate();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { t } = useTranslation('product');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { currency } = useSite();
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const getBadges = useCallback(
        (product: ShopperSearch.schemas['ProductSearchHit']) =>
            getProductBadges({ product, badgeDetails: config.global.badges, maxBadges: 2 }),
        [config.global.badges]
    );

    // Memoize the fallback value too, so consumers outside a provider get the same referential stability as those
    // inside one.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useMemo(() => ({ navigate, config, t, currency, getBadges }), [navigate, config, t, currency, getBadges]);
}
