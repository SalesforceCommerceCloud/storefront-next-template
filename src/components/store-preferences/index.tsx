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
import { type ReactElement } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import PreferredStore from './preferred-store';
import AuthorizedPickupPeople from './authorized-pickup-people';
import PickupPreferences from './pickup-preferences';

/**
 * Store Preferences page content. Displays the Store Preferences header,
 * Preferred Store for Pickup, Authorized Pickup People, and Pickup Preferences sections.
 */
export default function StorePreferences(): ReactElement {
    const { t } = useTranslation('account');

    return (
        <div className="space-y-5">
            {/* Store Preferences Header */}
            <Card className="bg-card border-border">
                <CardContent className="px-6 py-3">
                    <h1 className="text-2xl font-semibold text-foreground mb-1">{t('storePreferences.title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('storePreferences.subtitle')}</p>
                </CardContent>
            </Card>

            <PreferredStore />
            <AuthorizedPickupPeople />
            <PickupPreferences />
        </div>
    );
}
