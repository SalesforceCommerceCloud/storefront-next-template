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
import type { Route } from './+types/action.update-tracking-consent';
import { refreshAccessToken, getAuth, updateAuth } from '@/middlewares/auth.server';
import { isTrackingConsentEnabled } from '@/middlewares/auth.utils';
import { TrackingConsent } from '@/types/tracking-consent';
import { createActionError } from '@/lib/action-error-helpers.server';
import { ErrorCode } from '@/lib/error-codes';
import { getLogger } from '@/lib/logger.server';

/**
 * Server action to update tracking consent (DNT - Do Not Track) preference.
 *
 * This action refreshes the SLAS access token with the new tracking consent value,
 * which embeds the DNT preference in the token. The auth middleware then sets
 * the updated cookies via Set-Cookie headers.
 *
 * Note: This MUST be a server action (not clientAction) because:
 * 1. We need access to the refresh token from server-side auth context
 * 2. We need to set Set-Cookie HTTP headers, which can only be done server-side
 */
export const action = async ({ request, context }: Route.ActionArgs) => {
    const logger = getLogger(context);
    const formData = await request.formData();
    const trackingConsentValue = formData.get('trackingConsent');

    logger.debug('UpdateTrackingConsent: starting', { trackingConsentValue });

    // Verify tracking consent feature is enabled
    if (!isTrackingConsentEnabled(context)) {
        logger.warn('UpdateTrackingConsent: feature not enabled');
        return Response.json(
            {
                success: false,
                error: createActionError({
                    code: ErrorCode.INVALID_INPUT,
                    message: 'Tracking consent feature is not enabled',
                }),
            },
            { status: 400 }
        );
    }

    // Validate tracking consent value is a valid enum value
    if (!trackingConsentValue || !Object.values(TrackingConsent).includes(trackingConsentValue as TrackingConsent)) {
        logger.warn('UpdateTrackingConsent: invalid consent value', {
            providedValue: trackingConsentValue,
            validValues: Object.values(TrackingConsent),
        });
        return Response.json(
            {
                success: false,
                error: createActionError({
                    code: ErrorCode.INVALID_INPUT,
                    message: 'Invalid tracking consent value. Must be "0" (accepted) or "1" (declined)',
                }),
            },
            { status: 400 }
        );
    }

    const trackingConsent = trackingConsentValue as TrackingConsent;

    // Get current auth to retrieve refresh token
    const currentAuth = getAuth(context);
    if (currentAuth.authMode === 'trusted-agent')
        return Response.json({ success: true, trackingConsent: TrackingConsent.Declined });
    const refreshToken = currentAuth.refreshToken;

    const userType: 'guest' | 'registered' = currentAuth.userType || 'guest';

    if (refreshToken) {
        logger.debug('UpdateTrackingConsent: refreshing token with consent', {
            trackingConsent,
            userType,
        });
        // Standard flow: refresh the SLAS token with tracking consent embedded (DNT claim).
        // The authMiddleware in api-clients.ts automatically injects the sfdc_dwsid header
        // on SLAS requests, so SLAS reuses the existing ECOM session.
        // refreshAccessToken can throw an ApiError that has status/headers/body properties,
        // which React Router misidentifies as a Response and calls .json() — crashing.
        try {
            const tokenResponse = await refreshAccessToken(context, refreshToken, {
                trackingConsent,
            });
            // Update the auth context with the new token response
            updateAuth(context, tokenResponse, { isRefresh: true });
        } catch (error) {
            logger.warn('UpdateTrackingConsent: token refresh failed, updating session only', { error });
        }

        // Restore userType and set tracking consent.
        updateAuth(context, (session) => ({
            ...session,
            userType,
            trackingConsent,
        }));
    } else {
        logger.debug('UpdateTrackingConsent: no refresh token, updating session only', {
            trackingConsent,
        });
        // No refresh token (e.g., environments using client_credentials grant without refresh).
        // Skip token refresh and just update tracking consent in the session cookies.
        // The auth middleware will persist the tracking consent cookie in the response.
        updateAuth(context, (session) => ({
            ...session,
            trackingConsent,
        }));
    }

    logger.info('UpdateTrackingConsent: succeeded', { trackingConsent });
    return Response.json({ success: true, trackingConsent });
};
