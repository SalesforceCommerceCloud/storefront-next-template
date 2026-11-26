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
import { useAuthFetcher as useFetcher } from '@/hooks/use-auth-fetcher';
import { useTranslation } from 'react-i18next';

import { FETCHER_STATES } from '@/lib/fetcher-states';
import { resourceRoutes } from '@/route-paths';

/**
 * Custom hook for managing promo code actions (apply and remove) using React Router fetchers.
 *
 * This hook provides functionality to apply and remove promo codes from a shopping basket
 * using React Router's useFetcher for handling form submissions without navigation.
 *
 * @param basketId - Optional basket ID to associate promo code actions with
 * @returns Object containing promo code action functions and fetcher states
 * @returns applyPromoCode - Function to apply a promo code to the basket
 * @returns removePromoCode - Function to remove a promo code from the basket
 * @returns applyFetcher - React Router fetcher for apply promo code requests
 * @returns removeFetcher - React Router fetcher for remove promo code requests
 *
 * @example
 * ```tsx
 * const { applyPromoCode, removePromoCode, applyFetcher, removeFetcher } = usePromoCodeActions(basketId);
 *
 * // Apply a promo code
 * applyPromoCode('SAVE10');
 *
 * // Remove a promo code
 * removePromoCode('coupon-item-id');
 *
 * // Check if applying is in progress
 * if (applyFetcher.state === FETCHER_STATES.SUBMITTING) {
 *   // Show loading state
 * }
 * ```
 */
export function usePromoCodeActions(basketId?: string) {
    const { t } = useTranslation();
    const applyFetcher = useFetcher();
    const removeFetcher = useFetcher();

    /**
     * Applies a promo code to the current basket.
     * Does nothing while a previous apply is submitting or revalidating.
     *
     * @param code - The promo code string to apply
     * @throws Error if no basket ID is provided
     */
    const applyPromoCode = (code: string) => {
        if (!basketId) {
            throw new Error(t('errors:noBasketFound'));
        }

        // Ignore new calls until the previous response has settled, including its revalidation
        if (applyFetcher.state !== FETCHER_STATES.IDLE) {
            return;
        }

        void applyFetcher.submit(
            {
                promoCode: code,
            },
            {
                method: 'POST',
                action: resourceRoutes.promoCodeAdd,
            }
        );
    };

    /**
     * Removes a promo code from the current basket.
     * Does nothing while a previous remove is submitting or revalidating.
     *
     * @param couponItemId - The ID of the coupon item to remove
     * @throws Error if no basket ID is provided
     */
    const removePromoCode = (couponItemId: string) => {
        if (!basketId) {
            throw new Error(t('errors:noBasketFound'));
        }

        // Ignore new calls until the previous response has settled, including its revalidation
        if (removeFetcher.state !== FETCHER_STATES.IDLE) {
            return;
        }

        void removeFetcher.submit(
            {
                couponItemId,
            },
            {
                method: 'POST',
                action: resourceRoutes.promoCodeRemove,
            }
        );
    };

    return {
        applyPromoCode,
        removePromoCode,
        applyFetcher,
        removeFetcher,
    };
}
