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
import { useFetcherEffect } from '@/hooks/use-fetcher-effect';
import { createLogger } from '@/lib/logger';
import { resourceRoutes } from '@/route-paths';
import type {
    action as updateMarketingConsentAction,
    UpdateMarketingConsentResponse,
} from '@/routes/action.update-marketing-consent';

const logger = createLogger();

/** Payload for updating a single marketing consent subscription (opt-in/opt-out). */
export interface UpdateMarketingConsentPayload {
    subscriptionId: string;
    channel: 'email' | 'sms' | 'whatsapp';
    contactPointValue: string;
    status: 'opt_in' | 'opt_out';
}

/**
 * Hook for updating marketing consent. Submit one batch of changes per Save.
 *
 * Uses fetcher state for isUpdating (aligned with checkout/cart): buttons are disabled only
 * while fetcher.state === 'submitting'. No local isSubmitting state.
 *
 * @param onSuccess - Called after a successful update (e.g. revalidate).
 * @param onError - Called when the action returns success: false; receives message and optional response data (e.g. partialSuccess for 207).
 * @returns updateBatch(updates), isUpdating (true only while fetcher.state === 'submitting')
 */
export function useUpdateMarketingConsent(
    onSuccess?: () => void,
    onError?: (message: string, data?: UpdateMarketingConsentResponse) => void
): {
    updateBatch: (updates: UpdateMarketingConsentPayload[]) => void;
    isUpdating: boolean;
} {
    const fetcher = useFetcher<typeof updateMarketingConsentAction>();

    useFetcherEffect(fetcher, {
        onSuccess: () => {
            onSuccess?.();
        },
        onError: (error, data) => {
            const message = Array.isArray(error) ? error.join(', ') : error;
            logger.error('Marketing consent update failed', { message });
            onError?.(message, data);
        },
    });

    const updateBatch = (updates: UpdateMarketingConsentPayload[]): void => {
        if (updates.length === 0) return;
        void fetcher.submit({ updates } as unknown as FormData, {
            method: 'POST',
            action: resourceRoutes.updateMarketingConsent,
            encType: 'application/json',
        });
    };

    // Align with rest of the app: disable only while submitting. Button re-enables when state leaves 'submitting'.
    const isUpdating = fetcher.state === 'submitting';

    return { updateBatch, isUpdating };
}
