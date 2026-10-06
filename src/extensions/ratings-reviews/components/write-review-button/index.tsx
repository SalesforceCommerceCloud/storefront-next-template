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
/** @sfdc-extension-file SFDC_EXT_RATINGS_REVIEWS */
import { type ReactElement, useState, Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { InfoModalData, WriteReviewModalData } from '@/components/info-modal/types';
import type { WriteReviewFormData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { useRequireAuth } from '@/hooks/use-require-auth';

const InfoModal = lazy(() => import('@/components/info-modal'));

export interface WriteReviewButtonProps {
    /**
     * Form configuration (labels, placeholders, validation rules) supplied by the
     * loader. When omitted (still loading) the button uses translation fallbacks.
     */
    formConfig?: WriteReviewFormData;
}

/**
 * Write a Review button that opens the write-review InfoModal. Form configuration is
 * loaded by the parent route (deferred Promise) and passed in as a prop. Must be used
 * inside a `ProductReviewsProvider`.
 *
 * If the user is not authenticated (guest), a toast with Sign In / Sign Up options is
 * shown. After authentication, the review modal opens automatically via pending action
 * replay.
 */
export default function WriteReviewButton({ formConfig }: WriteReviewButtonProps): ReactElement {
    const { t } = useTranslation('extRatingsReviews');
    const [open, setOpen] = useState(false);

    const data: InfoModalData = {
        type: 'write-review',
        formConfig,
    } satisfies WriteReviewModalData;

    const handleWriteReviewClick = useRequireAuth(
        () => {
            setOpen(true);
            return Promise.resolve();
        },
        {
            actionName: 'writeReview',
        }
    );

    const label = formConfig?.title ?? t('writeReview.buttonLabel');
    return (
        <>
            <Button
                type="button"
                variant="default"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => void handleWriteReviewClick()}
                data-testid="write-review-button"
                aria-label={label}>
                {label}
            </Button>
            {open && (
                <Suspense fallback={null}>
                    <InfoModal open={open} onOpenChange={setOpen} data={data} />
                </Suspense>
            )}
        </>
    );
}
