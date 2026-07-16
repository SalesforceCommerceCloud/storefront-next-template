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
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopperSearch } from '@/scapi';
import { HeartIcon } from '../icons';
import { useToast } from '@/components/toast';
import { useIsInWishlist, useWishlistActions, useWishlistLoader } from '@/providers/wishlist';
import { useAnalytics } from '@/hooks/use-analytics';

interface WishlistButtonProps {
    product: ShopperSearch.schemas['ProductSearchHit'];
    variant?: ShopperSearch.schemas['ProductSearchHit'];
    size?: 'sm' | 'md' | 'lg';
    className?: string;
    tabIndex?: number;
    surface: 'pdp' | 'plp' | 'cart' | 'wishlist-page';
}

const WishlistButton = ({ product, variant, size = 'md', className, tabIndex, surface }: WishlistButtonProps) => {
    const { t } = useTranslation('product');
    const { addToast } = useToast();
    const { toggle, isPending } = useWishlistActions();
    const { trackWishlistItemAdded, trackWishlistItemRemoved } = useAnalytics();
    const loadWishlist = useWishlistLoader();

    // This heart is visible at load on the PDP (unlike the hover-gated tile heart), so it kicks
    // the once-per-session lazy read on mount — otherwise a returning shopper's saved PDP would
    // paint an empty heart until some unrelated intent. Idempotent (module-level guard).
    useEffect(() => {
        void loadWishlist();
    }, [loadWishlist]);

    const productId = variant?.productId || product.productId;
    // Per-product subscription via useSyncExternalStore — only re-renders when *this*
    // product's entry changes, not on unrelated wishlist mutations.
    const inWishlist = useIsInWishlist(productId);

    // Snapshot the membership flag at click time without re-subscribing on every
    // unrelated render — the toggle callback resolves the truth from the store via
    // the action result, but we still need the prior value for toast/analytics.
    const inWishlistRef = useRef(inWishlist);
    inWishlistRef.current = inWishlist;

    const handleWishlistToggle = useCallback(async () => {
        if (!productId || isPending) {
            return;
        }
        const wasInWishlist = inWishlistRef.current;
        const result = await toggle(productId);
        if (!result.success) {
            const errorKey = wasInWishlist ? 'failedToRemoveFromWishlist' : 'failedToAddToWishlist';
            addToast(t(errorKey), 'error');
            return;
        }
        // Detect the "already in wishlist" signal from add() (fast-path for stale state).
        const productName = product.productName || 'product';
        if ((result.data as { alreadyInWishlist?: boolean } | undefined)?.alreadyInWishlist) {
            addToast(t('alreadyInWishlist', { productName }), 'info');
            return;
        }
        // Match the existing useWishlist toast UX: confirm add/remove on success.
        const successKey = wasInWishlist ? 'removedFromWishlist' : 'addedToWishlist';
        addToast(t(successKey, { productName }), 'success');

        // Emit analytics event by surface — only for state-changing operations,
        // not for `alreadyInWishlist` no-ops (handled in the early return above).
        if (wasInWishlist) {
            void trackWishlistItemRemoved({ surface, productId });
        } else {
            void trackWishlistItemAdded({ surface, productId });
        }
    }, [
        productId,
        isPending,
        toggle,
        addToast,
        t,
        product.productName,
        surface,
        trackWishlistItemAdded,
        trackWishlistItemRemoved,
    ]);

    return (
        <HeartIcon
            isFilled={inWishlist}
            isLoading={isPending}
            // Wrap to discard the Promise return — HeartIcon's onClick is `() => void`,
            // so passing `handleWishlistToggle` directly trips no-misused-promises.
            onClick={() => void handleWishlistToggle()}
            size={size}
            className={className}
            tabIndex={tabIndex}
        />
    );
};

export { WishlistButton };
