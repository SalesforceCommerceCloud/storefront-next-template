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
import type { ReactElement } from 'react';
import DeferredProductRecommendations from '@/components/product-recommendations/deferred';
import { ProductRecommendationSkeleton } from '@/components/product/skeletons';
import { EINSTEIN_RECOMMENDERS } from '@/lib/product/einstein-recommenders';
import type { Recommendation } from '@/hooks/recommenders/use-recommenders';

interface CartCategoryRecommendationsProps {
    mayAlsoLikePromise: Promise<Recommendation>;
    recentlyViewedPromise: Promise<Recommendation>;
    mayAlsoLikeTitle: string;
    recentlyViewedTitle: string;
}

export default function CartCategoryRecommendations({
    mayAlsoLikePromise,
    recentlyViewedPromise,
    mayAlsoLikeTitle,
    recentlyViewedTitle,
}: CartCategoryRecommendationsProps): ReactElement {
    return (
        <>
            <DeferredProductRecommendations
                recommenderName={EINSTEIN_RECOMMENDERS.CART_MAY_ALSO_LIKE}
                recommenderTitle={mayAlsoLikeTitle}
                data={mayAlsoLikePromise}
                className="max-w-none px-0"
                fallback={<ProductRecommendationSkeleton title={mayAlsoLikeTitle} className="max-w-none px-0" />}
            />
            <DeferredProductRecommendations
                recommenderName={EINSTEIN_RECOMMENDERS.CART_RECENTLY_VIEWED}
                recommenderTitle={recentlyViewedTitle}
                data={recentlyViewedPromise}
                className="max-w-none px-0"
                fallback={
                    <ProductRecommendationSkeleton title={recentlyViewedTitle} className="max-w-none px-0" />
                }
            />
        </>
    );
}