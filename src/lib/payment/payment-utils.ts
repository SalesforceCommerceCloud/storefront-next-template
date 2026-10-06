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
import type { ShopperBasketsV2, ShopperOrders } from '@/scapi';

/**
 * Safely extracts and formats a masked credit card number from various payment instrument structures
 * @param paymentInstrument - Payment instrument from basket or order
 * @returns Formatted masked card number (e.g., "**** **** **** 1234")
 */
export function getFormattedMaskedCardNumber(
    paymentInstrument:
        | ShopperBasketsV2.schemas['OrderPaymentInstrument']
        | ShopperOrders.schemas['OrderPaymentInstrument']
        | undefined
): string {
    if (!paymentInstrument) {
        return '**** **** **** ****';
    }

    const maskedNumber = paymentInstrument.paymentCard?.maskedNumber || paymentInstrument.paymentCard?.numberLastDigits;

    if (maskedNumber) {
        // If it's already in masked format (contains asterisks), use it as-is
        if (maskedNumber.includes('*')) {
            return maskedNumber;
        }
        // If it's a full number (shouldn't happen in production), mask all but last 4
        return `**** **** **** ${maskedNumber.slice(-4)}`;
    }

    // Fallback if no masked number is found
    return '**** **** **** ****';
}

/**
 * Extracts the last 4 digits for display. Prefer numberLastDigits when present and valid
 * (e.g. from customer payment instruments); otherwise derive from maskedNumber.
 *
 * @param maskedNumber - Masked card number string (e.g. "************1234")
 * @param numberLastDigits - Optional last 4 digits from API (e.g. "1234")
 * @returns Last 4 digits or '****' if not found
 */
export function getLastFourDigits(maskedNumber: string | undefined, numberLastDigits?: string): string {
    if (numberLastDigits && /^\d{4}$/.test(numberLastDigits)) {
        return numberLastDigits;
    }
    if (!maskedNumber) {
        return '****';
    }

    // Extract the last 4 characters, assuming they are digits
    const lastFour = maskedNumber.slice(-4);

    // Verify they are actually digits
    if (/^\d{4}$/.test(lastFour)) {
        return lastFour;
    }

    // If not digits, try to find digits in the string
    const digits = maskedNumber.replace(/\D/g, '');
    if (digits.length >= 4) {
        return digits.slice(-4);
    }

    return '****';
}

/**
 * Gets a display-friendly card type from the payment instrument.
 * Display-only — never write these labels into SCAPI payment payloads.
 * Business Manager cardType ids must be passed through unchanged on the wire.
 */
export function getCardTypeDisplay(
    paymentInstrument:
        | ShopperBasketsV2.schemas['OrderPaymentInstrument']
        | ShopperOrders.schemas['OrderPaymentInstrument']
        | undefined,
    fallback: string = 'Credit Card'
): string {
    if (!paymentInstrument) {
        return fallback;
    }

    // Try different possible sources for the card type
    const cardType = paymentInstrument.paymentCard?.cardType || paymentInstrument.paymentMethodId;

    if (cardType) {
        // Normalize common card type values for UI labels only
        const normalizedType = cardType.toLowerCase().replace(/[_\s-]+/g, '');

        if (normalizedType.includes('visa')) return 'Visa';
        if (normalizedType.includes('mastercard') || normalizedType === 'master') return 'Mastercard';
        if (normalizedType.includes('amex') || normalizedType.includes('american')) return 'American Express';
        if (normalizedType.includes('discover')) return 'Discover';
        if (normalizedType.includes('diners')) return 'Diners Club';
        if (normalizedType.includes('jcb')) return 'JCB';
        if (normalizedType.includes('unionpay')) return 'UnionPay';

        // Return the original if no normalization applied
        return cardType;
    }

    return fallback;
}

/**
 * Detects a card brand from a PAN using standard BIN ranges.
 * Used only when the shopper enters a new card and Commerce has no cardType yet
 * (e.g. BASIC_CREDIT demo). Prefer exact Business Manager ids when known.
 * Common BM values: Visa, MasterCard, Amex, Discover, DinersClub, JCB, UnionPay.
 * Do not remap Commerce-returned cardType strings — pass those through as-is.
 */
export function detectCardType(cardNumber: string): string {
    if (!cardNumber) {
        return 'Unknown';
    }

    // Remove all non-digit characters
    const cleanNumber = cardNumber.replace(/\D/g, '');

    // Visa: starts with 4, length 13, 16, or 19
    if (/^4/.test(cleanNumber) && [13, 16, 19].includes(cleanNumber.length)) {
        return 'Visa';
    }

    // MasterCard: starts with 5[1-5] or 2[2-7], length 16 (BM id, not "Master Card")
    if ((/^5[1-5]/.test(cleanNumber) || /^2[2-7]/.test(cleanNumber)) && cleanNumber.length === 16) {
        return 'MasterCard';
    }

    // Amex: starts with 34 or 37, length 15 (common BM id)
    if (/^3[47]/.test(cleanNumber) && cleanNumber.length === 15) {
        return 'Amex';
    }

    // DinersClub: starts with 30[0-5], 36, or 38, length 14 (check before other 3x)
    if ((/^30[0-5]/.test(cleanNumber) || /^3[68]/.test(cleanNumber)) && cleanNumber.length === 14) {
        return 'DinersClub';
    }

    // JCB: starts with 35, length 16
    if (/^35/.test(cleanNumber) && cleanNumber.length === 16) {
        return 'JCB';
    }

    // UnionPay: starts with 62, length 16–19
    if (/^62/.test(cleanNumber) && cleanNumber.length >= 16 && cleanNumber.length <= 19) {
        return 'UnionPay';
    }

    // Discover: 6011, 644–649, 65xx, length 16 (exclude 62 UnionPay)
    if (
        cleanNumber.length === 16 &&
        (/^6011/.test(cleanNumber) || /^64[4-9]/.test(cleanNumber) || /^65/.test(cleanNumber))
    ) {
        return 'Discover';
    }

    // If no pattern matches, return generic
    return 'Credit Card';
}

/**
 * Checks if a payment instrument has valid card information
 * @param paymentInstrument - Payment instrument to validate
 * @returns True if payment instrument has valid card data
 */
export function hasValidPaymentCard(
    paymentInstrument: ShopperBasketsV2.schemas['OrderPaymentInstrument'] | undefined
): boolean {
    if (!paymentInstrument) {
        return false;
    }

    // For saved payment methods (when using customerPaymentInstrumentId),
    // Commerce Cloud may not return masked card numbers but will have paymentInstrumentId
    const isSavedPaymentMethod = !!paymentInstrument.paymentInstrumentId;

    if (isSavedPaymentMethod) {
        // For saved payment methods, verify we have basic card info
        return !!(
            paymentInstrument.paymentMethodId?.startsWith('CREDIT_CARD') && paymentInstrument.paymentCard?.cardType
        );
    }

    // For new payment methods, check if any form of masked card number exists
    const pi = paymentInstrument as Record<string, unknown>;
    const card = paymentInstrument.paymentCard as Record<string, unknown> | undefined;
    const hasCardNumber = !!(
        pi.maskedCreditCardNumber ||
        card?.maskedCreditCardNumber ||
        paymentInstrument.paymentCard?.maskedNumber
    );

    return hasCardNumber;
}

export type ApplicableCardSpec = {
    cardType?: string;
    numberPrefixes?: string[];
    numberLengths?: string[];
};

export type ApplicablePaymentMethodSpec = {
    id?: string;
    paymentProcessorId?: string;
    cards?: ApplicableCardSpec[];
};

/**
 * Match a PAN against Business Manager card specs from GET basket payment-methods.
 * Returns the exact `cardType` id Commerce expects (e.g. "Master Card" or "MasterCard").
 * Never invents a BM id — if nothing matches, returns undefined.
 */
export function resolveCardTypeFromCatalog(
    cardNumber: string,
    cards: ApplicableCardSpec[] | undefined
): string | undefined {
    if (!cardNumber || !cards?.length) {
        return undefined;
    }

    const digits = cardNumber.replace(/\D/g, '');
    if (!digits) {
        return undefined;
    }

    for (const card of cards) {
        if (!card.cardType || !card.numberPrefixes?.length) {
            continue;
        }

        if (card.numberLengths?.length) {
            const allowed = card.numberLengths.map((len) => Number(len));
            if (!allowed.includes(digits.length)) {
                continue;
            }
        }

        if (card.numberPrefixes.some((prefix) => matchesNumberPrefix(digits, prefix))) {
            return card.cardType;
        }
    }

    return undefined;
}

/**
 * Pick the applicable payment method whose BM card catalog matches this PAN.
 * Prefers CREDIT_CARD / BASIC_CREDIT (OOTB), then any method that has matching cards[].
 * Returns that method's id plus the exact catalog cardType — never invents either.
 */
export function resolveCardPaymentFromApplicableMethods(
    cardNumber: string,
    methods: ApplicablePaymentMethodSpec[] | undefined
): { paymentMethodId: string; cardType: string } | undefined {
    if (!cardNumber || !methods?.length) {
        return undefined;
    }

    const withCards = methods.filter((method) => method.id && method.cards?.length);
    if (!withCards.length) {
        return undefined;
    }

    const isPreferredCreditCard = (method: ApplicablePaymentMethodSpec) =>
        method.id === 'CREDIT_CARD' || method.paymentProcessorId === 'BASIC_CREDIT';

    const ordered = [
        ...withCards.filter(isPreferredCreditCard),
        ...withCards.filter((method) => !isPreferredCreditCard(method)),
    ];

    for (const method of ordered) {
        const cardType = resolveCardTypeFromCatalog(cardNumber, method.cards);
        if (cardType && method.id) {
            return { paymentMethodId: method.id, cardType };
        }
    }

    return undefined;
}

/** Supports exact prefixes ("4", "6011") and inclusive ranges ("51-55", "644-649"). */
function matchesNumberPrefix(cardDigits: string, prefixSpec: string): boolean {
    const spec = prefixSpec.trim();
    if (!spec) {
        return false;
    }

    if (spec.includes('-')) {
        const [startRaw, endRaw] = spec.split('-', 2);
        if (!startRaw || !endRaw || startRaw.length !== endRaw.length) {
            return false;
        }
        const width = startRaw.length;
        if (cardDigits.length < width) {
            return false;
        }
        const slice = cardDigits.slice(0, width);
        const start = Number(startRaw);
        const end = Number(endRaw);
        const value = Number(slice);
        if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(value)) {
            return false;
        }
        return value >= start && value <= end;
    }

    return cardDigits.startsWith(spec);
}
