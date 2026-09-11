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
import type { ComponentType } from 'react';
import { VisaIcon, MastercardIcon, AmexIcon, DiscoverIcon, GenericCardIcon } from '@/components/icons';

interface CardIconProps {
    className?: string;
    width?: number | string;
    height?: number | string;
}

/**
 * Map a Commerce/BM cardType (or display label) to an icon.
 * Matching is case/spacing-insensitive so MasterCard, Mastercard, and Master Card
 * all resolve — without rewriting the wire value.
 */
export const getCardIcon = (cardType: string): ComponentType<CardIconProps> => {
    const key = cardType.toLowerCase().replace(/[_\s-]+/g, '');
    switch (key) {
        case 'visa':
            return VisaIcon;
        case 'mastercard':
        case 'master':
            return MastercardIcon;
        case 'americanexpress':
        case 'amex':
            return AmexIcon;
        case 'discover':
            return DiscoverIcon;
        case 'dinersclub':
        case 'diners':
        case 'jcb':
        default:
            return GenericCardIcon;
    }
};
