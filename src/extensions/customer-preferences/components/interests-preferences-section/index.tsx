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
/** @sfdc-extension-file SFDC_EXT_CUSTOMER_PREFERENCES */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from 'react-i18next';
import { resourceRoutes } from '@/route-paths';
import { XIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/toast';
import { cn } from '@/lib/utils';

import type {
    CustomerPreferencesData,
    PreferenceValue,
} from '@/extensions/customer-preferences/lib/api/customer-preferences.server';
import type { action as customerPreferencesUpdateAction } from '@/extensions/customer-preferences/routes/action.customer-preferences-update';

export interface InterestsPreferencesSectionProps {
    /** Initial data resolved from the route loader. */
    initialData: CustomerPreferencesData;
}

/**
 * @feature-stub Customer interests & preferences
 * @status stub — no backend integration
 *
 * Combined Interests & Preferences section. Reads its initial state from the
 * route loader and submits updates via a `useFetcher` to
 * `/action/customer-preferences-update`. No client-side data fetching —
 * first render comes straight from SSR.
 *
 * See docs/README-FEATURE-STUBS.md for the full list and guidance on
 * productionizing or removing stubs.
 *
 * Current behavior:
 *   The server module backing this section (`lib/api/customer-preferences.server.ts`)
 *   ships with mock fixtures and an in-memory store. Reads return canned
 *   interest/preference catalogs; writes persist only for the lifetime of
 *   the server process and are not visible across multi-process or
 *   serverless deployments.
 *
 * To productionize:
 *   Replace the bodies of `getCustomerPreferencesData`,
 *   `updateCustomerInterests`, and `updateCustomerPreferences` in
 *   `lib/api/customer-preferences.server.ts` with calls to your real
 *   customer profile / personalization backend. Call sites in the loader
 *   and action route do not need to change.
 */
export function InterestsPreferencesSection({ initialData }: InterestsPreferencesSectionProps) {
    const { t } = useTranslation('extCustomerPreferences');
    const { addToast } = useToast();
    const fetcher = useFetcher<typeof customerPreferencesUpdateAction>();

    // Server-derived view state. Replaced by fetcher response after a successful save.
    const [serverInterests, setServerInterests] = useState<string[]>(initialData.customerInterests.selectedInterestIds);
    const [serverPreferences, setServerPreferences] = useState<Record<string, PreferenceValue>>(
        initialData.customerPreferences.preferences
    );

    // Keep server state in sync if the loader-provided initialData changes (revalidation).
    useEffect(() => {
        setServerInterests(initialData.customerInterests.selectedInterestIds);
    }, [initialData.customerInterests.selectedInterestIds]);
    useEffect(() => {
        setServerPreferences(initialData.customerPreferences.preferences);
    }, [initialData.customerPreferences.preferences]);

    const { availableInterests, interestCategories, availablePreferences } = initialData;

    const [isEditing, setIsEditing] = useState(false);
    const [pendingInterests, setPendingInterests] = useState<string[]>(serverInterests);
    const [pendingPreferences, setPendingPreferences] = useState<Record<string, PreferenceValue>>(serverPreferences);
    const [isInterestsDialogOpen, setIsInterestsDialogOpen] = useState(false);
    const [activeTabId, setActiveTabId] = useState<string>(interestCategories[0]?.id ?? '');
    const [activeMultiSelectId, setActiveMultiSelectId] = useState<string | null>(null);

    const isSaving = fetcher.state !== 'idle';

    // Keep pending state aligned with server state when not editing.
    useEffect(() => {
        if (!isEditing) {
            setPendingInterests([...serverInterests]);
            setPendingPreferences({ ...serverPreferences });
        }
    }, [isEditing, serverInterests, serverPreferences]);

    // Fire on `loading + data` (action complete, revalidation in flight) as well as `idle + data`
    // because parent-loader revalidation can unmount/remount this section before reaching `idle`.
    // The `hasHandledResponseRef` ensures only one toast per submission cycle.
    const previousFetcherStateRef = useRef<typeof fetcher.state | undefined>(undefined);
    const hasHandledResponseRef = useRef(false);
    useEffect(() => {
        if (fetcher.state === 'submitting') {
            hasHandledResponseRef.current = false;
        }

        const previousState = previousFetcherStateRef.current;
        const stateChanged = previousState !== fetcher.state;
        const hasCompletedOperation =
            fetcher.state === 'idle' || (fetcher.state === 'loading' && fetcher.data !== undefined);

        if (stateChanged && hasCompletedOperation && fetcher.data && !hasHandledResponseRef.current) {
            hasHandledResponseRef.current = true;
            if (fetcher.data.success === true) {
                setServerInterests(fetcher.data.customerInterests.selectedInterestIds);
                setServerPreferences(fetcher.data.customerPreferences.preferences);
                setIsEditing(false);
                addToast(t('interestsPreferences.successMessage'), 'success');
            } else {
                addToast(fetcher.data.error?.message || t('interestsPreferences.errorMessage'), 'error');
            }
        }

        previousFetcherStateRef.current = fetcher.state;
    }, [fetcher.state, fetcher.data, addToast, t]);

    const selectedInterestsWithNames = useMemo(() => {
        const ids = isEditing ? pendingInterests : serverInterests;
        return availableInterests.filter((interest) => ids.includes(interest.id));
    }, [isEditing, pendingInterests, serverInterests, availableInterests]);

    const activeCategory = useMemo(
        () => interestCategories.find((c) => c.id === activeTabId),
        [interestCategories, activeTabId]
    );

    const activeMultiSelect = availablePreferences.find((p) => p.id === activeMultiSelectId);

    const handleEdit = useCallback(() => setIsEditing(true), []);

    const handleCancel = useCallback(() => {
        setPendingInterests([...serverInterests]);
        setPendingPreferences({ ...serverPreferences });
        setIsEditing(false);
    }, [serverInterests, serverPreferences]);

    const handleSave = useCallback(() => {
        const formData = new FormData();
        for (const id of pendingInterests) {
            formData.append('interestIds', id);
        }
        formData.append('preferences', JSON.stringify(pendingPreferences));
        void fetcher.submit(formData, {
            method: 'PATCH',
            action: resourceRoutes.customerPreferencesUpdate,
        });
    }, [fetcher, pendingInterests, pendingPreferences]);

    const handleRemoveInterest = useCallback((interestId: string) => {
        setPendingInterests((prev) => prev.filter((id) => id !== interestId));
    }, []);

    const handleOpenInterestsDialog = useCallback(() => {
        setIsInterestsDialogOpen(true);
        if (interestCategories.length > 0) {
            setActiveTabId(interestCategories[0].id);
        }
    }, [interestCategories]);

    const handleCloseInterestsDialog = useCallback(() => setIsInterestsDialogOpen(false), []);

    const handleToggleInterestInDialog = useCallback((interestId: string, checked: boolean) => {
        setPendingInterests((prev) => (checked ? [...prev, interestId] : prev.filter((id) => id !== interestId)));
    }, []);

    const handleRemoveMultiSelectItem = useCallback((prefId: string, value: string) => {
        setPendingPreferences((prev) => {
            const current = prev[prefId];
            if (Array.isArray(current)) {
                return { ...prev, [prefId]: current.filter((v) => v !== value) };
            }
            return prev;
        });
    }, []);

    const handleToggleMultiSelectItem = useCallback((prefId: string, value: string, checked: boolean) => {
        setPendingPreferences((prev) => {
            const current = prev[prefId];
            const currentArray = Array.isArray(current) ? current : [];
            if (checked) {
                return { ...prev, [prefId]: [...currentArray, value] };
            }
            return { ...prev, [prefId]: currentArray.filter((v) => v !== value) };
        });
    }, []);

    const handleSelectButtonGroup = useCallback((prefId: string, value: string) => {
        setPendingPreferences((prev) => ({ ...prev, [prefId]: value }));
    }, []);

    const handleSelectChange = useCallback((prefId: string, value: string) => {
        setPendingPreferences((prev) => ({ ...prev, [prefId]: value }));
    }, []);

    const handleTextGroupChange = useCallback((prefId: string, fieldId: string, value: string) => {
        setPendingPreferences((prev) => {
            const current = prev[prefId];
            const currentRecord = typeof current === 'object' && !Array.isArray(current) ? current : {};
            return { ...prev, [prefId]: { ...currentRecord, [fieldId]: value } };
        });
    }, []);

    const getArrayValue = (value: PreferenceValue | undefined): string[] => (Array.isArray(value) ? value : []);

    const getTextGroupValue = (value: PreferenceValue | undefined): Record<string, string> =>
        typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};

    const getDisplayValue = (
        pref: { options?: { value: string; label: string }[] },
        value: PreferenceValue | undefined
    ) => {
        if (pref.options) {
            const option = pref.options.find((o) => o.value === value);
            return option?.label || String(value ?? '');
        }
        return String(value ?? '');
    };

    return (
        <>
            <Card data-testid="interests-preferences-section" className="bg-card border-border">
                <CardHeader className="flex flex-row items-start justify-between border-b border-border pb-4">
                    <div className="space-y-1.5">
                        <CardTitle className="text-base font-semibold">{t('interestsPreferences.title')}</CardTitle>
                        <CardDescription className="text-muted-foreground">
                            {t('interestsPreferences.description')}
                        </CardDescription>
                    </div>
                    {isEditing ? (
                        <div className="flex gap-2">
                            <Button
                                data-testid="interests-preferences-save-button"
                                size="sm"
                                onClick={handleSave}
                                disabled={isSaving}>
                                {isSaving ? t('common.saving') : t('common.save')}
                            </Button>
                            <Button
                                data-testid="interests-preferences-cancel-button"
                                variant="outline"
                                size="sm"
                                onClick={handleCancel}
                                disabled={isSaving}
                                className="bg-card border-border text-foreground hover:bg-muted/50 px-4 py-2 text-sm font-medium">
                                {t('common.cancel')}
                            </Button>
                        </div>
                    ) : (
                        <Button
                            data-testid="interests-preferences-edit-button"
                            variant="outline"
                            size="sm"
                            onClick={handleEdit}
                            className="bg-card border-border text-foreground hover:bg-muted/50 px-4 py-2 text-sm font-medium">
                            {t('common.edit')}
                        </Button>
                    )}
                </CardHeader>

                <CardContent className="pt-6">
                    <div className="space-y-6">
                        {/* ===== INTERESTS SECTION ===== */}
                        <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                                {t('interests.title')}
                            </p>

                            <div className="flex flex-wrap gap-2">
                                {selectedInterestsWithNames.length > 0 ? (
                                    selectedInterestsWithNames.map((interest) => (
                                        <span
                                            key={interest.id}
                                            data-testid={`interest-badge-${interest.id}`}
                                            className={`inline-flex items-center gap-1.5 rounded-ui px-3 py-1.5 text-sm font-medium ${
                                                isEditing
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-primary/10 text-primary'
                                            }`}>
                                            {interest.name}
                                            {isEditing && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveInterest(interest.id)}
                                                    className="ml-0.5 rounded-ui hover:bg-primary-foreground/20 focus:outline-none focus:ring-2 focus:ring-primary-foreground/50"
                                                    aria-label={`Remove ${interest.name}`}>
                                                    <XIcon className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-sm text-muted-foreground">{t('interests.noneSelected')}</span>
                                )}
                            </div>

                            {isEditing && (
                                <button
                                    type="button"
                                    data-testid="interests-add-more-button"
                                    onClick={handleOpenInterestsDialog}
                                    className="text-sm font-medium text-primary hover:underline">
                                    + {t('interests.addMore')}
                                </button>
                            )}
                        </div>

                        {/* ===== PREFERENCES SECTION ===== */}
                        {availablePreferences.map((pref) => {
                            const currentValue = isEditing ? pendingPreferences[pref.id] : serverPreferences[pref.id];

                            return (
                                <div key={pref.id} className="space-y-3">
                                    {/* Multi-select (Product Categories style) */}
                                    {pref.type === 'multi-select' && (
                                        <>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                                                {pref.name}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {getArrayValue(currentValue).length > 0 ? (
                                                    getArrayValue(currentValue).map((val) => {
                                                        const label =
                                                            pref.options?.find((o) => o.value === val)?.label || val;
                                                        return (
                                                            <span
                                                                key={val}
                                                                data-testid={`pref-badge-${pref.id}-${val}`}
                                                                className={`inline-flex items-center gap-1.5 rounded-ui px-3 py-1.5 text-sm font-medium ${
                                                                    isEditing
                                                                        ? 'bg-primary text-primary-foreground'
                                                                        : 'bg-primary/10 text-primary'
                                                                }`}>
                                                                {label}
                                                                {isEditing && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            handleRemoveMultiSelectItem(pref.id, val)
                                                                        }
                                                                        className="ml-0.5 rounded-ui hover:bg-primary-foreground/20 focus:outline-none focus:ring-2 focus:ring-primary-foreground/50"
                                                                        aria-label={`Remove ${label}`}>
                                                                        <XIcon className="h-3.5 w-3.5" />
                                                                    </button>
                                                                )}
                                                            </span>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">
                                                        {t('preferences.noneSelected')}
                                                    </span>
                                                )}
                                            </div>
                                            {isEditing && (
                                                <button
                                                    type="button"
                                                    data-testid={`pref-${pref.id}-add-more-button`}
                                                    onClick={() => setActiveMultiSelectId(pref.id)}
                                                    className="text-sm font-medium text-primary hover:underline">
                                                    + {t('preferences.addMore')}
                                                </button>
                                            )}
                                        </>
                                    )}

                                    {/* Button Group (Shopping Preferences style) */}
                                    {pref.type === 'button-group' && pref.options && (
                                        <>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                                                {pref.name}
                                            </p>
                                            <div className="grid grid-cols-3 gap-3">
                                                {pref.options.map((option) => {
                                                    const isSelected = currentValue === option.value;
                                                    return (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            aria-pressed={isSelected}
                                                            onClick={() =>
                                                                isEditing &&
                                                                handleSelectButtonGroup(pref.id, option.value)
                                                            }
                                                            disabled={!isEditing}
                                                            className={cn(
                                                                'rounded-ui px-4 py-2.5 text-sm font-medium transition-colors',
                                                                isSelected
                                                                    ? 'bg-foreground text-background'
                                                                    : isEditing
                                                                      ? 'border border-border bg-card text-foreground hover:bg-muted/50'
                                                                      : 'border border-border bg-card text-muted-foreground',
                                                                !isEditing ? 'cursor-default' : 'cursor-pointer'
                                                            )}>
                                                            {option.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}

                                    {/* Text Group (Measures style) */}
                                    {pref.type === 'text-group' &&
                                        pref.fields &&
                                        (() => {
                                            const textGroupValue = getTextGroupValue(currentValue);
                                            const hasAnyValue = Object.values(textGroupValue).some(
                                                (v) => v && v.trim() !== ''
                                            );

                                            return (
                                                <>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                                                        {pref.name}
                                                    </p>
                                                    {isEditing ? (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            {pref.fields.map((field) => {
                                                                const fieldValue = textGroupValue[field.id] || '';
                                                                return (
                                                                    <div
                                                                        key={field.id}
                                                                        className={
                                                                            field.width === 'full'
                                                                                ? 'col-span-2'
                                                                                : 'col-span-1'
                                                                        }>
                                                                        <label
                                                                            htmlFor={`field-${field.id}`}
                                                                            className="mb-1.5 block text-sm font-medium text-foreground">
                                                                            {field.label}
                                                                        </label>
                                                                        <Input
                                                                            id={`field-${field.id}`}
                                                                            type="text"
                                                                            placeholder={field.placeholder}
                                                                            value={fieldValue}
                                                                            onChange={(e) =>
                                                                                handleTextGroupChange(
                                                                                    pref.id,
                                                                                    field.id,
                                                                                    e.target.value
                                                                                )
                                                                            }
                                                                            disabled={isSaving}
                                                                            className="w-full"
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : hasAnyValue ? (
                                                        <div className="space-y-1">
                                                            {(textGroupValue.room_width ||
                                                                textGroupValue.room_length) && (
                                                                <p className="text-sm text-muted-foreground">
                                                                    <span className="font-medium text-foreground">
                                                                        {t('measures.roomDimensionsLabel')}
                                                                    </span>{' '}
                                                                    {textGroupValue.room_width || '—'}
                                                                    &quot; × {textGroupValue.room_length || '—'}
                                                                    &quot;
                                                                </p>
                                                            )}
                                                            {textGroupValue.ceiling_height && (
                                                                <p className="text-sm text-muted-foreground">
                                                                    <span className="font-medium text-foreground">
                                                                        {t('measures.ceilingHeightLabel')}
                                                                    </span>{' '}
                                                                    {textGroupValue.ceiling_height}&quot;
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-muted-foreground">
                                                            {t('measures.noneProvided')}
                                                        </p>
                                                    )}
                                                </>
                                            );
                                        })()}

                                    {/* Select (Size Preference style) */}
                                    {pref.type === 'select' &&
                                        pref.options &&
                                        (() => {
                                            const hasSelectedValue =
                                                currentValue && currentValue !== 'no_preference' && currentValue !== '';

                                            if (!isEditing && !hasSelectedValue) {
                                                return null;
                                            }

                                            return isEditing ? (
                                                <>
                                                    <label
                                                        htmlFor={`pref-${pref.id}`}
                                                        className="text-sm font-medium text-foreground">
                                                        {pref.name}
                                                    </label>
                                                    <div className="w-full [&>div]:w-full">
                                                        <NativeSelect
                                                            id={`pref-${pref.id}`}
                                                            value={String(currentValue || '')}
                                                            onChange={(e) =>
                                                                handleSelectChange(pref.id, e.target.value)
                                                            }
                                                            disabled={isSaving}>
                                                            {pref.options.map((option) => (
                                                                <NativeSelectOption
                                                                    key={option.value}
                                                                    value={option.value}>
                                                                    {option.label}
                                                                </NativeSelectOption>
                                                            ))}
                                                        </NativeSelect>
                                                    </div>
                                                    {pref.description && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {pref.description}
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    <span className="font-medium text-foreground">
                                                        {t('size.preferredSizeLabel')}
                                                    </span>{' '}
                                                    {getDisplayValue(pref, currentValue)}
                                                </p>
                                            );
                                        })()}
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Tabbed Interest Selection Dialog */}
            <Dialog open={isInterestsDialogOpen} onOpenChange={(open) => !open && handleCloseInterestsDialog()}>
                <DialogContent
                    data-testid="interests-dialog"
                    className="sm:max-w-xl max-h-[80vh] flex flex-col"
                    showCloseButton={true}>
                    <DialogHeader className="pb-0">
                        <DialogTitle>{t('interests.addInterestsTitle')}</DialogTitle>
                    </DialogHeader>

                    <div className="border-b border-muted-foreground/20">
                        <div className="flex gap-1 overflow-x-auto">
                            {interestCategories.map((category) => (
                                <button
                                    key={category.id}
                                    type="button"
                                    data-testid={`interests-tab-${category.id}`}
                                    onClick={() => setActiveTabId(category.id)}
                                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                                        activeTabId === category.id
                                            ? 'border-b-2 border-primary text-foreground'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}>
                                    {category.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-2">
                        {activeCategory && (
                            <div className="flex flex-col gap-3">
                                {activeCategory.options.map((interest) => {
                                    const isChecked = pendingInterests.includes(interest.id);
                                    return (
                                        <label
                                            key={interest.id}
                                            htmlFor={`dialog-interest-${interest.id}`}
                                            className="flex items-center justify-between border border-input px-4 py-3.5 cursor-pointer hover:bg-accent transition-colors">
                                            <span className="text-sm font-normal">{interest.name}</span>
                                            <Checkbox
                                                id={`dialog-interest-${interest.id}`}
                                                checked={isChecked}
                                                onCheckedChange={(checked) =>
                                                    handleToggleInterestInDialog(interest.id, checked === true)
                                                }
                                                className="size-5 border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                            />
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="border-t border-muted-foreground/20 pt-4">
                        <Button type="button" variant="outline" onClick={handleCloseInterestsDialog}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            data-testid="interests-dialog-save-button"
                            onClick={handleCloseInterestsDialog}>
                            {t('common.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Multi-select Preference Dialog */}
            <Dialog open={activeMultiSelectId !== null} onOpenChange={(open) => !open && setActiveMultiSelectId(null)}>
                <DialogContent data-testid="product-categories-dialog" className="sm:max-w-xl" showCloseButton={true}>
                    <DialogHeader>
                        <DialogTitle>
                            {activeMultiSelect?.name
                                ? t('preferences.selectCategory', { category: activeMultiSelect.name })
                                : t('preferences.dialogTitle')}
                        </DialogTitle>
                    </DialogHeader>

                    {activeMultiSelect && (
                        <div className="flex flex-col gap-3 py-2">
                            {activeMultiSelect.options?.map((option) => {
                                const isChecked = getArrayValue(pendingPreferences[activeMultiSelect.id]).includes(
                                    option.value
                                );
                                return (
                                    <label
                                        key={option.value}
                                        htmlFor={`dialog-pref-${option.value}`}
                                        className="flex items-center justify-between border border-input px-4 py-3.5 cursor-pointer hover:bg-accent transition-colors">
                                        <span className="text-sm font-normal">{option.label}</span>
                                        <Checkbox
                                            id={`dialog-pref-${option.value}`}
                                            checked={isChecked}
                                            onCheckedChange={(checked) =>
                                                handleToggleMultiSelectItem(
                                                    activeMultiSelect.id,
                                                    option.value,
                                                    checked === true
                                                )
                                            }
                                            className="size-5 border-input data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                        />
                                    </label>
                                );
                            })}
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setActiveMultiSelectId(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            type="button"
                            data-testid="product-categories-dialog-save-button"
                            onClick={() => setActiveMultiSelectId(null)}>
                            {t('common.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/**
 * Skeleton fallback used by the Suspense boundary while the loader Promise resolves.
 */
export { InterestsPreferencesSectionSkeleton } from './skeleton';

export default InterestsPreferencesSection;
