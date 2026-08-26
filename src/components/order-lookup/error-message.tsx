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

'use client';

import { useTranslation } from 'react-i18next';
import { Link } from '@/components/link';
import { Button } from '@/components/ui/button';
import { useRateLimitCountdown } from './use-rate-limit-countdown';

export interface OrderLookupErrorMessageProps {
    id?: string;
    code:
        | 'VALIDATION'
        | 'TURNSTILE_FAILED'
        | 'BOT_CHECK'
        | 'COOLDOWN'
        | 'RATE_LIMITED'
        | 'INVALID_CODE'
        | 'ATTEMPTS_EXCEEDED'
        | 'SCAPI_UNSUPPORTED'
        | 'REQUEST_FAILED'
        | 'LOOKUP_FAILED'
        | 'FEATURE_DISABLED'
        | string;
    retryAfterSeconds?: number;
    onRequestNewCode?: () => void;
    onRetry?: () => void;
    /**
     * When true, the component renders as `role='alert'` for submit-blocking errors.
     * Default false — uses `aria-live='polite'`.
     */
    submitBlocking?: boolean;
}

export function OrderLookupErrorMessage({
    id,
    code,
    retryAfterSeconds,
    onRequestNewCode,
    onRetry,
    submitBlocking = false,
}: OrderLookupErrorMessageProps) {
    const { t } = useTranslation(['guestOrderLookup', 'orderLookup', 'common']);
    const { remaining, done } = useRateLimitCountdown(retryAfterSeconds);

    const isNonRecoverable = code === 'SCAPI_UNSUPPORTED' || code === 'FEATURE_DISABLED';

    const getMessage = (): string => {
        switch (code) {
            case 'VALIDATION':
                return t('guestOrderLookup:errorInvalidInput');
            case 'TURNSTILE_FAILED':
            case 'BOT_CHECK':
                return t('guestOrderLookup:errorTurnstileFailed');
            case 'COOLDOWN':
                if (retryAfterSeconds && remaining > 0) {
                    return t('guestOrderLookup:cooldownActive', { seconds: remaining });
                }
                return t('orderLookup:verify.errors.rateLimited');
            case 'RATE_LIMITED':
                if (retryAfterSeconds && remaining > 0) {
                    return t('orderLookup:verify.errors.rateLimitedWithTime', { seconds: remaining });
                }
                return t('orderLookup:verify.errors.rateLimited');
            case 'INVALID_CODE':
                return t('orderLookup:verify.errors.invalidCode');
            case 'ATTEMPTS_EXCEEDED':
                return t('orderLookup:verify.errors.attemptsExceeded');
            case 'SCAPI_UNSUPPORTED':
                return t('orderLookup:verify.errors.scapiUnsupported');
            case 'REQUEST_FAILED':
                return t('guestOrderLookup:errorApiUnavailable');
            case 'LOOKUP_FAILED':
                return t('guestOrderLookup:errorApiUnavailable');
            case 'FEATURE_DISABLED':
                return t('orderLookup:verify.errors.featureDisabled');
            default:
                // Unknown codes fall through to generic error
                return t('guestOrderLookup:errorApiUnavailable');
        }
    };

    const message = getMessage();

    return (
        <div
            id={id}
            className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-ui"
            role={submitBlocking ? 'alert' : undefined}
            aria-live={submitBlocking ? undefined : 'polite'}>
            <p>{message}</p>

            {code === 'ATTEMPTS_EXCEEDED' && onRequestNewCode && (
                <Button
                    type="button"
                    onClick={onRequestNewCode}
                    variant="link"
                    className="mt-2 p-0 h-auto text-destructive underline hover:no-underline"
                    aria-label={t('orderLookup:verify.requestNewCode')}>
                    {t('orderLookup:verify.requestNewCode')}
                </Button>
            )}

            {code === 'RATE_LIMITED' && onRetry && done && (
                <Button
                    type="button"
                    onClick={onRetry}
                    variant="link"
                    className="mt-2 p-0 h-auto text-destructive underline hover:no-underline"
                    aria-label={t('orderLookup:verify.retryVerification')}>
                    {t('orderLookup:verify.retryVerification')}
                </Button>
            )}

            {isNonRecoverable && (
                <Link
                    to="/customer-service"
                    className="inline-block mt-2 text-destructive underline hover:no-underline"
                    aria-label={t('common:contactSupport', 'Contact customer service')}>
                    {t('common:contactSupport', 'Contact customer service')}
                </Link>
            )}
        </div>
    );
}
