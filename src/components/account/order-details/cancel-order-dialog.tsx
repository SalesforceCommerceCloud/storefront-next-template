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
import { type ReactElement, type RefObject, useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ShopperOrders } from '@/scapi';

type OmsReasonCode = ShopperOrders.schemas['OmsReasonCode'];

export type CancelActionResult = { success: true } | { success: false; error: { kind: string; status: number } };

export type CancelOrderDialogProps = {
    orderNo: string;
    cancelReasonCodes: OmsReasonCode[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSettled?: (result: CancelActionResult) => void;
    /** The trigger button; focus returns here when the dialog closes. */
    triggerRef?: RefObject<HTMLButtonElement | null>;
    /**
     * Fallback focus target used when `triggerRef.current` is null (e.g. the button unmounted
     * after a successful cancel). Prevents focus dropping to `<body>` on dialog close.
     */
    fallbackFocusRef?: RefObject<HTMLElement | null>;
};

export default function CancelOrderDialog({
    orderNo,
    cancelReasonCodes,
    open,
    onOpenChange,
    onSettled,
    triggerRef,
    fallbackFocusRef,
}: CancelOrderDialogProps): ReactElement {
    const { t } = useTranslation('account');
    const fetcher = useFetcher<CancelActionResult>();
    const isSubmitting = fetcher.state !== 'idle';

    const showReasonDropdown = cancelReasonCodes.length > 0;
    const defaultReason = cancelReasonCodes.find((code) => code.default)?.reason ?? '';
    const [selectedReason, setSelectedReason] = useState(defaultReason);

    // Reset reason selection when dialog opens
    useEffect(() => {
        if (open) {
            setSelectedReason(defaultReason);
        }
    }, [open, defaultReason]);

    // Close dialog on success or error (matches PWA Kit pattern) and notify parent
    useEffect(() => {
        if (fetcher.data && fetcher.state === 'idle') {
            onOpenChange(false);
            onSettled?.(fetcher.data);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to settled fetcher data
    }, [fetcher.data, fetcher.state]);

    const handleConfirm = () => {
        const formData = new FormData();
        formData.set('orderNo', orderNo);
        if (showReasonDropdown && selectedReason) {
            formData.set('reason', selectedReason);
        }
        void fetcher.submit(formData, { method: 'post', action: '/action/cancel-order' });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                onCloseAutoFocus={(event) => {
                    // Restore focus to the trigger, or the fallback when the trigger has unmounted
                    // (the Cancel button returns null after a successful cancel). Without this,
                    // Radix drops focus to <body> when the trigger is gone.
                    const target = triggerRef?.current ?? fallbackFocusRef?.current;
                    if (target) {
                        event.preventDefault();
                        target.focus();
                    }
                }}>
                <DialogHeader>
                    <DialogTitle>{t('orders.cancelDialogTitle', { orderNo })}</DialogTitle>
                    <DialogDescription>
                        {showReasonDropdown
                            ? t('orders.cancelDialogSubtitle')
                            : t('orders.cancelDialogSubtitleNoReasons')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <p className="text-sm font-medium">{t('orders.cancelDialogImpact')}</p>

                    {showReasonDropdown && (
                        <div>
                            <label htmlFor="cancel-reason-select" className="text-sm font-semibold">
                                {t('orders.cancelReasonLabel')}
                            </label>
                            <NativeSelect
                                id="cancel-reason-select"
                                value={selectedReason}
                                onChange={(e) => setSelectedReason(e.target.value)}
                                className="mt-1">
                                <NativeSelectOption value="">{t('orders.cancelReasonPlaceholder')}</NativeSelectOption>
                                {cancelReasonCodes.map((code) => (
                                    <NativeSelectOption key={code.reason} value={code.reason ?? ''}>
                                        {code.reason}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-row gap-2 sm:justify-end">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        {t('orders.cancelKeepOrder')}
                    </Button>
                    <Button type="button" onClick={handleConfirm} disabled={isSubmitting}>
                        {isSubmitting ? t('orders.cancelConfirmSubmitting') : t('orders.cancelConfirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
