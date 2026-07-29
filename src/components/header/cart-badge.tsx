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
import { lazy, type ReactElement, Suspense, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useBasketSnapshot } from '@/providers/basket';
import { useMiniCartDataLoader } from '@/hooks/use-mini-cart-data';
import { setMiniCartOpen, useMiniCartStore } from '@/hooks/mini-cart-store';
import CartBadgeIcon from './cart-badge-icon';
import { useTranslation } from 'react-i18next';

const CartSheet = lazy(() => import('./cart-sheet'));

/**
 * The cart badge defers the loading of the mini cart sheet until the very first user interaction
 * with the cart icon. The loading of the sheet component itself could in theory also happen earlier,
 * e.g. right after the initial load on the client. Subject for experiments...
 */
export default function CartBadge(): ReactElement {
    const snapshot = useBasketSnapshot();
    const { t } = useTranslation('cart');
    const numberOfItems = snapshot?.uniqueProductCount ?? 0;
    const [clicked, setClicked] = useState<boolean>(false);
    const miniCartOpen = useMiniCartStore((s) => s.open);

    // Warm the mini-cart data path on hover/focus/touch so the basket and product details (images, variations,
    // promotions) are ideally available by the time the user clicks. The loader handles dedup; the cart sheet's open
    // state is unchanged — only data fetching starts sooner.
    //
    // Skip when no basketId is known (no snapshot, no prior basket call) — without an existing basket there's nothing
    // to enrich, and triggering the resource route would force a network call on a low-engagement hover. Empty baskets
    // (basketId set, items=0) are also skipped.
    const loadMiniCartData = useMiniCartDataLoader();
    const hasBasketId = Boolean(snapshot?.basketId);
    const hasItems = numberOfItems > 0;
    const prefetch = useCallback(() => {
        if (!hasBasketId || !hasItems) {
            return;
        }
        loadMiniCartData();
    }, [hasBasketId, hasItems, loadMiniCartData]);

    // Ensure CartSheet is lazy-loaded when opened externally (e.g. add-to-cart)
    if (miniCartOpen && !clicked) {
        setClicked(true);
    }

    if (clicked) {
        return (
            <Suspense
                fallback={
                    <Button
                        variant="ghost"
                        className="relative pointer-events-none lg:has-[>svg]:px-4 has-[>svg]:px-1 hover:bg-transparent"
                        aria-label={t('badge.ariaLabel', { count: numberOfItems })}>
                        <CartBadgeIcon numberOfItems={numberOfItems} />
                    </Button>
                }>
                <CartSheet>
                    <Button
                        variant="ghost"
                        className="relative cursor-pointer lg:has-[>svg]:px-4 has-[>svg]:px-1 hover:bg-transparent hover:opacity-50 transition-opacity"
                        onPointerEnter={prefetch}
                        onFocus={prefetch}
                        aria-label={t('badge.ariaLabel', { count: numberOfItems })}>
                        <CartBadgeIcon numberOfItems={numberOfItems} />
                    </Button>
                </CartSheet>
            </Suspense>
        );
    }

    return (
        <Button
            variant="ghost"
            className="relative cursor-pointer lg:has-[>svg]:px-4 has-[>svg]:px-1 hover:bg-transparent hover:opacity-50 transition-opacity"
            onClick={() => {
                setClicked(true);
                setMiniCartOpen(true);
            }}
            onPointerEnter={prefetch}
            onFocus={prefetch}
            aria-label={t('badge.ariaLabel', { count: numberOfItems })}>
            <CartBadgeIcon numberOfItems={numberOfItems} />
        </Button>
    );
}
