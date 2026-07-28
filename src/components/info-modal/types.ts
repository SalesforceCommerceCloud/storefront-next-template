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

// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
import type { WriteReviewFormData, ReviewItem } from '@/extensions/ratings-reviews/lib/api/reviews.server';
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
// @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
import type { ReturnsAndWarrantyData } from '@/extensions/product-content/lib/api/product-content.server';
// @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT
// @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
import type { EstimatedDeliveryData } from '@/extensions/shipping-delivery/lib/api/shipping-delivery.server';
// @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY

/**
 * Payment schedule data for installment payment modal
 */
export interface PaymentSchedule {
    /** Total purchase amount */
    totalAmount: number;
    /** Number of payments */
    numberOfPayments: number;
    /** Individual payment details */
    payments: Array<{
        /** Payment amount */
        amount: number;
        /** Due date or relative time (e.g., "Today", "2 weeks") */
        dueDate: string;
    }>;
}

/**
 * Step information for "How it works" sections
 */
export interface StepInfo {
    /** Step number */
    number: number;
    /** Step description text */
    text: string;
}

/** Shared fields for modal header */
interface InfoModalDataBase {
    title?: string;
    description?: string;
}

/** Data for payment schedule modal (e.g. Pay in 4) */
export interface PaymentScheduleModalData extends InfoModalDataBase {
    type: 'payment-schedule';
    paymentSchedule?: PaymentSchedule;
    steps?: StepInfo[];
    disclaimer?: string;
}

// @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
/** Data for write a review modal */
export interface WriteReviewModalData extends InfoModalDataBase {
    type: 'write-review';
    /** Form labels, placeholders, and config from product content adapter (e.g. getWriteReviewForm). Optional until loaded. */
    formConfig?: WriteReviewFormData;
    /** Called after a successful submit (e.g. order details: mark line as reviewed). PDP omits this. */
    onAfterSubmit?: (review: ReviewItem) => void;
}

/** Rating distribution data for a single star rating */
export interface RatingDistributionData {
    /** Star rating (1-5) */
    rating: number;
    /** Number of reviews for this rating */
    count: number;
}

/** Data for star rating distribution modal */
export interface StarRatingDistributionModalData extends InfoModalDataBase {
    type: 'star-rating-distribution';
    /** Overall rating value (0-5) */
    rating: number;
    /** Total number of reviews */
    reviewCount: number;
    /** Array of rating distribution data for 1-5 stars */
    distributions: RatingDistributionData[];
    /** Optional callback when "See customer reviews" button is clicked */
    onSeeReviewsClick?: () => void;
}
// @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS

// @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
/** Data for estimated delivery / fulfillment & shipping modal */
export interface EstimatedDeliveryModalData extends InfoModalDataBase {
    type: 'estimated-delivery';
    deliveryData: EstimatedDeliveryData;
}
// @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY

// @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
/** Data for returns & warranty modal */
export interface ReturnsAndWarrantyModalData extends InfoModalDataBase {
    type: 'returns-and-warranty';
    returnsAndWarrantyData: ReturnsAndWarrantyData;
}
// @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT

/**
 * Structured data for the info modal. Add new modal types by defining a new variant
 * (e.g. SizeGuideModalData) and extending this union.
 */
export type InfoModalData =
    // @sfdc-extension-block-start SFDC_EXT_SHIPPING_DELIVERY
    | EstimatedDeliveryModalData
    // @sfdc-extension-block-end SFDC_EXT_SHIPPING_DELIVERY
    // @sfdc-extension-block-start SFDC_EXT_RATINGS_REVIEWS
    | WriteReviewModalData
    | StarRatingDistributionModalData
    // @sfdc-extension-block-end SFDC_EXT_RATINGS_REVIEWS
    // @sfdc-extension-block-start SFDC_EXT_PRODUCT_CONTENT
    | ReturnsAndWarrantyModalData
    // @sfdc-extension-block-end SFDC_EXT_PRODUCT_CONTENT
    | PaymentScheduleModalData;

export interface InfoModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Modal data - structured data from adapter */
    data?: InfoModalData;
    /** Optional custom className for the dialog content */
    className?: string;
}
