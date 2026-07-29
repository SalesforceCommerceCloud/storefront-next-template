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
import { type ComponentProps, lazy, Suspense, useCallback, useState } from 'react';
import { type WishlistButton } from '@/components/buttons/wishlist-button';
import { HeartIcon } from '@/components/icons';
import { useIsInWishlist, useWishlistLoader } from '@/providers/wishlist';

const LazyWishlistButton = lazy(() =>
    import('@/components/buttons/wishlist-button').then((m) => ({ default: m.WishlistButton }))
);

type WishlistButtonProps = ComponentProps<typeof WishlistButton>;

/**
 * Deferred WishlistButton for product tiles. Renders a placeholder icon until the tile receives a pointer event,
 * then lazy-loads the real {@link WishlistButton} (with its useRequireAuth + pending-action machinery).
 *
 * The placeholder subscribes to wishlist membership via the shared store so the heart paints filled on first SSR
 * render for items already in the shopper's wishlist. The original deferral existed to skip the per-tile
 * `useFetcher` pair (×2) used by the legacy `useWishlist` hook; membership now comes from the module-level store
 * (no per-tile fetch), so a read here is cheap. The lazy boundary still defers the interactive hooks
 * (`useRequireAuth`, `useCheckAndExecutePendingAction`, `useToast`) until pointer enter.
 *
 * The lazy wishlist load is triggered by the enclosing `ProductTile` on first tile intent (the
 * heart is `opacity-0` until tile hover, so the trigger belongs on the tile, not this icon); the
 * redundant call here is a harmless idempotent backstop.
 */
export function DeferredWishlistButton(props: WishlistButtonProps) {
    const [loaded, setLoaded] = useState(false);
    const productId = props.variant?.productId || props.product.productId;
    // Per-product subscription via useSyncExternalStore — only re-renders when
    // *this* tile's entry changes, never on unrelated wishlist updates.
    const inWishlist = useIsInWishlist(productId);
    const loadWishlist = useWishlistLoader();

    // First intent: lazy-load the interactive button, and kick the wishlist load as an idempotent
    // backstop (the tile is the primary trigger).
    const handleIntent = useCallback(() => {
        void loadWishlist();
        setLoaded(true);
    }, [loadWishlist]);

    if (loaded) {
        return (
            <Suspense
                fallback={
                    <HeartIcon
                        isFilled={inWishlist}
                        size={props.size}
                        className={props.className}
                        tabIndex={props.tabIndex}
                    />
                }>
                <LazyWishlistButton {...props} />
            </Suspense>
        );
    }

    return (
        <HeartIcon
            isFilled={inWishlist}
            size={props.size}
            className={props.className}
            tabIndex={props.tabIndex}
            onPointerEnter={handleIntent}
            onFocus={handleIntent}
            onTouchStart={handleIntent}
        />
    );
}
