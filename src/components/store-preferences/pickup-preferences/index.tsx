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
import { type ReactElement, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export type PickupPreferencesState = {
    autoSelectStore: boolean;
    pickupNotifications: boolean;
    storeEventsPromotions: boolean;
};

const MOCK_INITIAL_PREFERENCES: PickupPreferencesState = {
    autoSelectStore: false,
    pickupNotifications: false,
    storeEventsPromotions: false,
};

/**
 * Pickup Preferences section. Displays and edits pickup notification and store
 * preferences with view/edit modes. Fully mocked (no backend).
 */
export default function PickupPreferences(): ReactElement {
    const { t } = useTranslation('account');
    const { addToast } = useToast();
    const [savedPreferences, setSavedPreferences] = useState<PickupPreferencesState>(MOCK_INITIAL_PREFERENCES);
    const [editingPreferences, setEditingPreferences] = useState<PickupPreferencesState>(MOCK_INITIAL_PREFERENCES);
    const [isEditing, setIsEditing] = useState(false);

    const handleEdit = useCallback(() => {
        setEditingPreferences(savedPreferences);
        setIsEditing(true);
    }, [savedPreferences]);

    const handleCancel = useCallback(() => {
        setEditingPreferences(savedPreferences);
        setIsEditing(false);
    }, [savedPreferences]);

    const handleSave = useCallback(() => {
        setSavedPreferences(editingPreferences);
        setIsEditing(false);
        addToast(t('storePreferences.pickupPreferences.saveSuccess'), 'success');
    }, [editingPreferences, addToast, t]);

    const setAutoSelectStore = useCallback((checked: boolean) => {
        setEditingPreferences((prev) => ({ ...prev, autoSelectStore: checked }));
    }, []);

    const setPickupNotifications = useCallback((checked: boolean) => {
        setEditingPreferences((prev) => ({ ...prev, pickupNotifications: checked }));
    }, []);

    const setStoreEventsPromotions = useCallback((checked: boolean) => {
        setEditingPreferences((prev) => ({ ...prev, storeEventsPromotions: checked }));
    }, []);

    const preferences = isEditing ? editingPreferences : savedPreferences;

    return (
        <Card className="">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <CardTitle className="text-lg">{t('storePreferences.pickupPreferences.heading')}</CardTitle>
                    <CardDescription className="mt-1">
                        {t('storePreferences.pickupPreferences.description')}
                    </CardDescription>
                </div>
                <CardAction>
                    {isEditing ? (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="default" onClick={handleSave}>
                                {t('storePreferences.pickupPreferences.save')}
                            </Button>
                            <Button type="button" variant="outline" onClick={handleCancel}>
                                {t('storePreferences.pickupPreferences.cancel')}
                            </Button>
                        </div>
                    ) : (
                        <Button type="button" variant="outline" onClick={handleEdit}>
                            {t('storePreferences.pickupPreferences.edit')}
                        </Button>
                    )}
                </CardAction>
            </CardHeader>
            <CardContent className="space-y-6 border-t border-border pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between gap-y-1">
                    <div className="min-w-0">
                        <Label htmlFor="auto-select-store" className="text-sm font-medium text-foreground">
                            {t('storePreferences.pickupPreferences.autoSelectStore')}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t('storePreferences.pickupPreferences.autoSelectStoreDescription')}
                        </p>
                    </div>
                    <Switch
                        id="auto-select-store"
                        checked={preferences.autoSelectStore}
                        disabled={!isEditing}
                        onCheckedChange={setAutoSelectStore}
                        className="shrink-0"
                    />
                </div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between gap-y-1">
                    <div className="min-w-0">
                        <Label htmlFor="pickup-notifications" className="text-sm font-medium text-foreground">
                            {t('storePreferences.pickupPreferences.pickupNotifications')}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t('storePreferences.pickupPreferences.pickupNotificationsDescription')}
                        </p>
                    </div>
                    <Switch
                        id="pickup-notifications"
                        checked={preferences.pickupNotifications}
                        disabled={!isEditing}
                        onCheckedChange={setPickupNotifications}
                        className="shrink-0"
                    />
                </div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between gap-y-1">
                    <div className="min-w-0">
                        <Label htmlFor="store-events-promotions" className="text-sm font-medium text-foreground">
                            {t('storePreferences.pickupPreferences.storeEventsPromotions')}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t('storePreferences.pickupPreferences.storeEventsPromotionsDescription')}
                        </p>
                    </div>
                    <Switch
                        id="store-events-promotions"
                        checked={preferences.storeEventsPromotions}
                        disabled={!isEditing}
                        onCheckedChange={setStoreEventsPromotions}
                        className="shrink-0"
                    />
                </div>
            </CardContent>
        </Card>
    );
}
