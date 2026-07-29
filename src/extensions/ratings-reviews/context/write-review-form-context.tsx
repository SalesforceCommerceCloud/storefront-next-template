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
/* oxlint-disable react-refresh/only-export-components -- provider and hook are co-located by design */
import { createContext, useContext, type PropsWithChildren, type ReactElement } from 'react';
import type { WriteReviewFormData } from '@/extensions/ratings-reviews/lib/api/reviews.server';

const WriteReviewFormContext = createContext<Promise<WriteReviewFormData> | null>(null);

export function useWriteReviewForm(): Promise<WriteReviewFormData> | null {
    return useContext(WriteReviewFormContext);
}

export type WriteReviewFormProviderProps = PropsWithChildren<{
    writeReviewFormPromise: Promise<WriteReviewFormData>;
}>;

export function WriteReviewFormProvider({
    writeReviewFormPromise,
    children,
}: WriteReviewFormProviderProps): ReactElement {
    return <WriteReviewFormContext.Provider value={writeReviewFormPromise}>{children}</WriteReviewFormContext.Provider>;
}
