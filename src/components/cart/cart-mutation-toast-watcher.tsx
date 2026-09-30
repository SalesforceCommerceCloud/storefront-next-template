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

// React
import { type ReactElement, useEffect, useRef } from 'react';

// React Router
import { useFetcher } from 'react-router';

// i18n
import { useTranslation } from 'react-i18next';

// Components
import { useToast } from '@/components/toast';

// Hooks
import {
    type CartMutationKind,
    unregisterPendingCartMutation,
    useMiniCartPendingMutations,
} from '@/hooks/cart-mutation-toast-store';

// Lib
import { resolveQuantityUpdateToast, resolveRemoveItemToast } from '@/lib/cart/cart-mutation-toast-resolvers';

/** The subset of a settled basket-action response the toast copy depends on. */
interface CartMutationResult {
    success?: boolean;
    error?: { code?: string };
}

/**
 * A keyed fetcher's `data` is `unknown` at runtime. Both cart actions resolve to an object carrying a boolean
 * `success`, so require that before treating a settled response as a mutation result. This rejects an
 * unrelated or malformed payload reusing the same fetcher key instead of rendering it as a spurious failure
 * toast.
 */
function isCartMutationResult(data: unknown): data is CartMutationResult {
    return typeof data === 'object' && data !== null && typeof (data as { success?: unknown }).success === 'boolean';
}

/**
 * One leaf per handed-off mutation. Its `useFetcher({key})` re-attaches to the exact fetcher the unmounted
 * line item submitted — the one operation that keeps React Router from purging that fetcher's settled data
 * now that its original owner is gone. When the response settles it fires the matching toast once (guarded
 * against React StrictMode's dev double-invoke), then unregisters itself, which drops this leaf on the next
 * render.
 */
function PendingCartMutationToast({ mutationKey, kind }: { mutationKey: string; kind: CartMutationKind }): null {
    const fetcher = useFetcher({ key: mutationKey });
    const { addToast } = useToast();
    const { t: tQuantity } = useTranslation('quantitySelector');
    const { t: tRemove } = useTranslation('removeItem');
    const firedRef = useRef(false);

    useEffect(() => {
        if (firedRef.current) return;

        const { data } = fetcher;
        if (fetcher.state !== 'idle' || !isCartMutationResult(data)) return;

        firedRef.current = true;
        const { message, type } =
            kind === 'remove' ? resolveRemoveItemToast(data, tRemove) : resolveQuantityUpdateToast(data, tQuantity);
        addToast(message, type);
        unregisterPendingCartMutation(mutationKey);
    }, [fetcher.state, fetcher.data, kind, mutationKey, addToast, tQuantity, tRemove]);

    return null;
}

/**
 * Root-mounted sibling of `BasketCookieReconciler`. When a mini-cart line item unmounts mid-mutation (the
 * shopper closed the drawer before the quantity PATCH or remove POST settled), the unmounting hook hands its
 * keyed fetcher off to {@link useMiniCartPendingMutations}. This watcher mounts one `useFetcher({key})` leaf
 * per pending entry so the confirmation / error toast still fires exactly once — matching the in-panel
 * behavior — instead of being lost with the unmounted line item. Renders nothing itself.
 */
export function CartMutationToastWatcher(): ReactElement {
    const pending = useMiniCartPendingMutations();
    return (
        <>
            {pending.map(({ key, kind }) => (
                <PendingCartMutationToast key={key} mutationKey={key} kind={kind} />
            ))}
        </>
    );
}
