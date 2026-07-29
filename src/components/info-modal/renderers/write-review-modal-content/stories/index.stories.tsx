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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { WriteReviewModalContent } from '../../write-review-modal-content';
import type { WriteReviewFormData } from '@/extensions/ratings-reviews/lib/api/reviews.server';
import { ConfigProvider } from '@salesforce/storefront-next-runtime/config';
import { mockConfig } from '@/test-utils/config';
import type { ReactElement } from 'react';

const defaultFormConfig: WriteReviewFormData = {
    title: 'Write a Review',
    overallRating: {
        label: 'Overall Rating',
        required: true,
        placeholder: 'Select a rating',
    },
    reviewTitle: {
        label: 'Review Title',
        placeholder: 'Summarize your experience',
        maxCharacters: 250,
    },
    reviewBody: {
        label: 'Your Review',
        placeholder: 'What did you like or dislike about this product?',
        minCharacters: 50,
        maxCharacters: 2000,
    },
    recommend: {
        label: 'Would you recommend this product?',
        yesLabel: 'Yes',
        noLabel: 'No',
    },
    addPhotos: {
        label: 'Add Photos (Optional)',
        hint: 'Click to upload or drag and drop',
        accept: 'PNG, JPG',
        maxSize: '5MB',
    },
    termsText: 'By submitting this review, you agree to our Terms of Service and Privacy Policy.',
    cancelLabel: 'Cancel',
    submitLabel: 'Submit Review',
};

function WriteReviewModalContentWrapper({
    formConfig,
    onClose,
}: {
    formConfig?: WriteReviewFormData;
    onClose?: () => void;
}): ReactElement {
    return (
        <ConfigProvider config={mockConfig}>
            <div className="max-w-lg p-6">
                <WriteReviewModalContent onClose={onClose} formConfig={formConfig} />
            </div>
        </ConfigProvider>
    );
}

const meta: Meta<typeof WriteReviewModalContentWrapper> = {
    title: 'Core/Overlays/Info Modal/Write Review Modal Content',
    component: WriteReviewModalContentWrapper,
    tags: ['autodocs'],
    parameters: {
        layout: 'centered',
        docs: {
            description: {
                component: `
WriteReviewModalContent is a renderer component that displays the write-a-review form within the InfoModal.

This component is used internally by InfoModal when the modal type is 'write-review'. It renders:
- Overall rating (stars)
- Review title and body fields
- Would you recommend (Yes/No)
- Optional photo upload area
- Terms text and Cancel/Submit buttons
                `,
            },
        },
    },
    // `formConfig` is a deeply structured fixture that would render as a
    // JSON editor in Controls — fails the Designer-Friendly Input Rule.
    // The two stories already cover the with-config and without-config
    // branches. `onClose` is a function ref, not editable in Controls.
    argTypes: {
        formConfig: { control: false, table: { disable: true } },
        onClose: { control: false, table: { disable: true } },
    },
};

export default meta;
type Story = StoryObj<typeof WriteReviewModalContentWrapper>;

export const Default: Story = {
    args: {
        formConfig: defaultFormConfig,
    },
};

export const WithoutFormConfig: Story = {
    args: {
        formConfig: undefined,
    },
};
