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
import { useCallback } from 'react';
import { SHOPPER_CONTEXT_ACTION_NAME } from '@/lib/shopper-context/constants';
import { resourceRoutes } from '@/route-paths';
import type { action as updateShopperContextAction } from '@/routes/action.update-shopper-context';

/**
 * Hook for updating shopper context from client components
 * Uses React Router's useFetcher to call client actions
 *
 * @returns Object with update functions and fetcher state
 */
export function useShopperContext() {
    const fetcher = useFetcher<typeof updateShopperContextAction>({ key: SHOPPER_CONTEXT_ACTION_NAME });

    /**
     * Update all qualifiers in shopper context from UI interaction
     * Supports customQualifiers, assignmentQualifiers, couponCodes, sourceCode, and other root-level qualifiers
     *
     * @param qualifiers - Object with qualifier key-value pairs to update (including sourceCode)
     * @throws Error if usid is not available (user not authenticated)
     */
    const updateQualifiers = useCallback(
        async (qualifiers: Record<string, string> = {}) => {
            const formData = new FormData();

            if (Object.keys(qualifiers).length > 0) {
                formData.set('qualifiers', JSON.stringify(qualifiers));
            }

            await fetcher.submit(formData, {
                method: 'PUT', // Always use PUT to update shopper context
                action: resourceRoutes.updateShopperContext,
            });
        },
        [fetcher]
    );

    return {
        updateQualifiers,
        isLoading: fetcher.state === 'submitting' || fetcher.state === 'loading',
        error: fetcher.data?.success === false ? new Error(fetcher.data.error?.message || 'Unknown error') : null,
        success: fetcher.data?.success === true,
    };
}
