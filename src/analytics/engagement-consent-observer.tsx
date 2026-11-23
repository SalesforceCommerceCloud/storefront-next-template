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
import { useLayoutEffect } from 'react';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { getConsentAwareEventMediator } from '@salesforce/storefront-next-runtime/events';
import { useAuth } from '@/providers/auth';
import { useTrackingConsent } from '@/hooks/use-tracking-consent';
import { getAllAdapters, buildConsentPreferences } from '@/lib/adapters';

/** Publishes consent before analytics effects, without initializing adapters or shopper auth. */
export function EngagementConsentObserver() {
    const config = useConfig();
    const assisted = useAuth()?.authMode === 'trusted-agent';
    const { trackingConsent, isTrackingConsentEnabled } = useTrackingConsent();
    const categories = config.engagement.analytics.trackingConsent?.consentCategories;

    useLayoutEffect(() => {
        // Assisted sessions must revoke previously loaded SDKs even when consent controls are disabled.
        const preferences = assisted
            ? []
            : buildConsentPreferences(trackingConsent, categories ?? [], isTrackingConsentEnabled);
        getConsentAwareEventMediator(getAllAdapters)?.notifyConsentChange(preferences);
    }, [trackingConsent, categories, isTrackingConsentEnabled, assisted]);

    return null;
}
