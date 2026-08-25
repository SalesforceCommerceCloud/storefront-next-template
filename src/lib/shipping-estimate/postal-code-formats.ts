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
import { normalizeCountryCode } from './country-code';

export interface PostalCodeFormat {
    /** Validation regex applied to the *normalized* input. */
    regex: RegExp;
    /** Example postal code used in placeholders and error messages. */
    example: string;
    /** Max characters accepted in the input (post-normalize). */
    maxLength: number;
    /** HTML `inputMode` hint. `numeric` disables letters on mobile keyboards. */
    inputMode: 'numeric' | 'text';
    /**
     * Normalizes raw user input before validation:
     * strip disallowed characters, upper-case, insert canonical spaces, etc.
     */
    normalize: (raw: string) => string;
    /** i18n label for the postal-code term ("ZIP code", "postal code", "postcode", "CAP"). */
    termKey: 'zip' | 'postalCode' | 'postcode' | 'cap' | 'eircode';
}

const stripAndUpper = (max: number) => (raw: string) =>
    raw
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, max);

/**
 * Canadian postal codes: `A1A 1A1` — one space after the third character.
 */
const normalizeCA = (raw: string): string => {
    const cleaned = stripAndUpper(6)(raw);
    return cleaned.length > 3 ? `${cleaned.slice(0, 3)} ${cleaned.slice(3)}` : cleaned;
};

/**
 * UK postcodes: 5–7 chars, space before the final 3 (`SW1A 1AA`, `M1 1AE`).
 */
const normalizeGB = (raw: string): string => {
    const cleaned = stripAndUpper(7)(raw);
    if (cleaned.length < 5) return cleaned;
    return `${cleaned.slice(0, cleaned.length - 3)} ${cleaned.slice(-3)}`;
};

const numericOnly =
    (max: number) =>
    (raw: string): string =>
        raw.replace(/\D/g, '').slice(0, max);

/**
 * Country → format spec.
 *
 * Regexes run against the *normalized* input (see `normalize`). Sources:
 *  - US: USPS ZIP / ZIP+4 (`\d{5}(-\d{4})?`)
 *  - CA: Canada Post `A1A 1A1` — no D, F, I, O, Q, U in position 1;
 *        no D, F, I, O, Q, U, W, Z in later letter positions.
 *  - GB: Royal Mail relaxed pattern — full BS7666 is stricter, but this
 *        covers 99% of consumer entries without false negatives.
 *  - Others: length + digit-class checks; we validate loosely to avoid
 *    blocking legitimate codes we haven't researched.
 */
const FORMATS: Record<string, PostalCodeFormat> = {
    US: {
        regex: /^\d{5}(-\d{4})?$/,
        example: '90210',
        maxLength: 10,
        inputMode: 'numeric',
        normalize: (raw) =>
            raw
                .replace(/[^\d-]/g, '')
                .replace(/^-+|-+$/g, '')
                .slice(0, 10),
        termKey: 'zip',
    },
    CA: {
        regex: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJKLMNPRSTVXY] \d[ABCEGHJKLMNPRSTVXY]\d$/,
        example: 'M5V 3A8',
        maxLength: 7,
        inputMode: 'text',
        normalize: normalizeCA,
        termKey: 'postalCode',
    },
    GB: {
        regex: /^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/,
        example: 'SW1A 1AA',
        maxLength: 8,
        inputMode: 'text',
        normalize: normalizeGB,
        termKey: 'postcode',
    },
    IE: {
        regex: /^[A-Z]\d{2} [A-Z\d]{4}$/,
        example: 'D02 X285',
        maxLength: 8,
        inputMode: 'text',
        normalize: (raw) => {
            const cleaned = stripAndUpper(7)(raw);
            return cleaned.length > 3 ? `${cleaned.slice(0, 3)} ${cleaned.slice(3)}` : cleaned;
        },
        termKey: 'eircode',
    },
    IT: {
        regex: /^\d{5}$/,
        example: '00100',
        maxLength: 5,
        inputMode: 'numeric',
        normalize: numericOnly(5),
        termKey: 'cap',
    },
    DE: {
        regex: /^\d{5}$/,
        example: '10115',
        maxLength: 5,
        inputMode: 'numeric',
        normalize: numericOnly(5),
        termKey: 'postalCode',
    },
    FR: {
        regex: /^\d{5}$/,
        example: '75001',
        maxLength: 5,
        inputMode: 'numeric',
        normalize: numericOnly(5),
        termKey: 'postalCode',
    },
    ES: {
        regex: /^\d{5}$/,
        example: '28001',
        maxLength: 5,
        inputMode: 'numeric',
        normalize: numericOnly(5),
        termKey: 'postalCode',
    },
    NL: {
        regex: /^\d{4} [A-Z]{2}$/,
        example: '1011 AA',
        maxLength: 7,
        inputMode: 'text',
        normalize: (raw) => {
            const cleaned = stripAndUpper(6)(raw);
            return cleaned.length > 4 ? `${cleaned.slice(0, 4)} ${cleaned.slice(4)}` : cleaned;
        },
        termKey: 'postalCode',
    },
    JP: {
        regex: /^\d{3}-\d{4}$/,
        example: '100-0001',
        maxLength: 8,
        inputMode: 'numeric',
        normalize: (raw) => {
            const digits = raw.replace(/\D/g, '').slice(0, 7);
            return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
        },
        termKey: 'postalCode',
    },
    CN: {
        regex: /^\d{6}$/,
        example: '100000',
        maxLength: 6,
        inputMode: 'numeric',
        normalize: numericOnly(6),
        termKey: 'postalCode',
    },
    TW: {
        regex: /^\d{3}(\d{2})?$/,
        example: '100',
        maxLength: 5,
        inputMode: 'numeric',
        normalize: numericOnly(5),
        termKey: 'postalCode',
    },
    KR: {
        regex: /^\d{5}$/,
        example: '04524',
        maxLength: 5,
        inputMode: 'numeric',
        normalize: numericOnly(5),
        termKey: 'postalCode',
    },
    PL: {
        regex: /^\d{2}-\d{3}$/,
        example: '00-001',
        maxLength: 6,
        inputMode: 'numeric',
        normalize: (raw) => {
            const digits = raw.replace(/\D/g, '').slice(0, 5);
            return digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
        },
        termKey: 'postalCode',
    },
    PT: {
        regex: /^\d{4}-\d{3}$/,
        example: '1000-001',
        maxLength: 8,
        inputMode: 'numeric',
        normalize: (raw) => {
            const digits = raw.replace(/\D/g, '').slice(0, 7);
            return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
        },
        termKey: 'postalCode',
    },
    SE: {
        regex: /^\d{3} \d{2}$/,
        example: '111 22',
        maxLength: 6,
        inputMode: 'numeric',
        normalize: (raw) => {
            const digits = raw.replace(/\D/g, '').slice(0, 5);
            return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
        },
        termKey: 'postalCode',
    },
    DK: {
        regex: /^\d{4}$/,
        example: '1050',
        maxLength: 4,
        inputMode: 'numeric',
        normalize: numericOnly(4),
        termKey: 'postalCode',
    },
    FI: {
        regex: /^\d{5}$/,
        example: '00100',
        maxLength: 5,
        inputMode: 'numeric',
        normalize: numericOnly(5),
        termKey: 'postalCode',
    },
    NO: {
        regex: /^\d{4}$/,
        example: '0150',
        maxLength: 4,
        inputMode: 'numeric',
        normalize: numericOnly(4),
        termKey: 'postalCode',
    },
    AU: {
        regex: /^\d{4}$/,
        example: '2000',
        maxLength: 4,
        inputMode: 'numeric',
        normalize: numericOnly(4),
        termKey: 'postcode',
    },
    NZ: {
        regex: /^\d{4}$/,
        example: '6011',
        maxLength: 4,
        inputMode: 'numeric',
        normalize: numericOnly(4),
        termKey: 'postcode',
    },
};

/**
 * Permissive fallback for countries not explicitly mapped: 3–10 chars,
 * letters/digits/spaces/hyphens. We prefer accepting user input over
 * blocking valid entries we haven't researched.
 */
const FALLBACK_FORMAT: PostalCodeFormat = {
    regex: /^[A-Z0-9][A-Z0-9 -]{1,8}[A-Z0-9]$/,
    example: '',
    maxLength: 10,
    inputMode: 'text',
    normalize: (raw) =>
        raw
            .replace(/[^A-Za-z0-9 -]/g, '')
            .toUpperCase()
            .slice(0, 10),
    termKey: 'postalCode',
};

/**
 * Resolves the postal-code format for a locale string.
 *
 * Matches by the country suffix (e.g. `en-CA` → `CA`), so a US-English
 * shopper on a CA site gets Canadian validation.
 *
 * @param locale BCP-47 tag like `en-US`, `fr-CA`, `en-GB`. Case-insensitive.
 */
export function getPostalCodeFormat(countryOrLocale: string | null | undefined): PostalCodeFormat {
    const countryCode = normalizeCountryCode(countryOrLocale) ?? getCountryCodeFromLocale(countryOrLocale);
    return countryCode ? (FORMATS[countryCode] ?? FALLBACK_FORMAT) : FALLBACK_FORMAT;
}

export function getCountryCodeFromLocale(locale: string | null | undefined): string | undefined {
    if (!locale) return undefined;
    try {
        return normalizeCountryCode(new Intl.Locale(locale.trim()).region);
    } catch {
        return undefined;
    }
}
