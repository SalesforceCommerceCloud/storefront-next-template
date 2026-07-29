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

/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// React
import { type ReactElement, useCallback, useEffect, useState } from 'react';

// Hooks
import { useItemFetcher } from '@/hooks/use-item-fetcher';
import { useConfig } from '@salesforce/storefront-next-runtime/config';
import { useBasketUpdater } from '@/providers/basket';

// Components
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/toast';
import { useTranslation } from 'react-i18next';

// Types
import type { BasketActionResponse } from '@/routes/types/action-responses';

export interface RemoveItemConfig {
    action: string;
    confirmDescription: string;
}

interface RemoveItemButtonWithConfirmationProps {
    itemId: string;
    config?: RemoveItemConfig;
    className?: string;
}

/**
 * RemoveItemButtonWithConfirmation component that renders a remove button with confirmation dialog
 *
 * This component provides:
 * - Remove item functionality with confirmation dialog
 * - Configurable messages and actions through config prop
 * - Default configuration from cart constants
 * - Loading states and error handling
 *
 * Used by cart-content components for consistent remove item behavior.
 */
export function RemoveItemButtonWithConfirmation({
    itemId,
    config,
    className = '',
}: RemoveItemButtonWithConfirmationProps): ReactElement {
    const appConfig = useConfig();
    const removeAction = config?.action || appConfig.pages.cart.removeAction;
    const confirmDescription = config?.confirmDescription || appConfig.pages.cart.confirmDescription || '';
    const { t } = useTranslation('removeItem');

    // Create a unique fetcher for this component instance
    const fetcher = useItemFetcher({
        itemId,
        componentName: 'remove-item-button',
    });
    const isLoading = fetcher.state === 'submitting';
    const [showConfirmation, setShowConfirmation] = useState(false);
    const { addToast } = useToast();
    const updateBasket = useBasketUpdater();

    // Handle UI effects (toast notifications)
    useEffect(() => {
        if (fetcher.state === 'idle' && fetcher.data) {
            if (fetcher.data.success) {
                // Publish the new revision so useBasket() consumers stay in sync, matching the other basket
                // mutation handlers. Dedups by `lastModified`. Shape-safe: no basket read or mutation sets
                // `expand`, so every response carries the SCAPI default and can't down-shape provider consumers.
                const responseBasket = (fetcher.data as BasketActionResponse).basket;
                if (responseBasket) {
                    updateBasket(responseBasket);
                }
                addToast(t('success'), 'success');
            } else {
                addToast(t('failed'), 'error');
            }
        }
        //As addToast is unlikely to change, we don't need to include it in the dependency array
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [fetcher.state, fetcher.data, t, updateBasket]);

    // Remove item function
    const removeItem = useCallback(() => {
        if (!itemId) return;

        const formData = new FormData();
        formData.append('itemId', itemId);
        void fetcher.submit(formData, {
            method: 'POST',
            action: removeAction,
        });
    }, [itemId, removeAction, fetcher]);

    // Handle confirmation dialog actions
    const handleCancel = useCallback(() => {
        setShowConfirmation(false);
    }, []); // No dependencies needed - only calls setShowConfirmation with static value

    const handleConfirm = useCallback(() => {
        setShowConfirmation(false);
        removeItem();
        // removeItem: stable function from useRemoveItem hook, no need to recreate callback
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <Button
                variant="link"
                size="sm"
                disabled={isLoading}
                className={`text-sm font-medium leading-5 text-primary cursor-pointer hover:no-underline ${className ?? ''}`}
                title={t('title')}
                data-testid={`remove-item-${itemId}`}
                aria-busy={isLoading}
                onClick={() => setShowConfirmation(true)}>
                {isLoading ? t('removing') : t('button')}
            </Button>

            <ConfirmationDialog
                open={showConfirmation}
                onOpenChange={setShowConfirmation}
                title={t('confirmTitle')}
                description={confirmDescription}
                cancelButtonText={t('cancelButton')}
                confirmButtonText={t('confirmAction')}
                onCancel={handleCancel}
                onConfirm={handleConfirm}
                confirmButtonDisabled={isLoading}
            />
        </>
    );
}
