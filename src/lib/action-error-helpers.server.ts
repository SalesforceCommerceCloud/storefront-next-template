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
import { CommerceContextError } from '@/lib/auth/commerce-context.server';
import { LocalInventoryError } from '@/lib/product/local-inventory-error';
import { getTranslation } from '@salesforce/storefront-next-runtime/i18n';
import { ErrorCode, type ActionError } from '@/lib/error-codes';
import { ApiError, InventoryQuantityError } from '@/scapi';
import { getErrorMessage } from '@/lib/utils';

export type { ActionError } from '@/lib/error-codes';

export function createActionError(args: { code: string; message: string }): ActionError;
export function createActionError(args: { error: unknown; code?: string }): ActionError;
export function createActionError(args: { code?: string; message?: string; error?: unknown }): ActionError {
    if (args.message !== undefined && args.code !== undefined) {
        return { code: args.code, message: args.message };
    }

    const error = args.error;
    const fallbackCode = args.code ?? ErrorCode.OPERATION_FAILED;

    if (error instanceof CommerceContextError) {
        const { t } = getTranslation();
        return {
            code: error.code,
            message: t(
                error.code === 'STORE_CHANGE_CONFIRMATION_REQUIRED'
                    ? 'routeError:commerceContext.confirmationMessage'
                    : 'routeError:commerceContext.unavailableMessage'
            ),
        };
    }
    if (error instanceof InventoryQuantityError) {
        const { t } = getTranslation();
        return { code: ErrorCode.INVALID_INPUT, message: t('product:inventory.unavailable') };
    }
    if (error instanceof LocalInventoryError) {
        const unavailable = error.code === 'LOCAL_STOCK_UNAVAILABLE';
        const { t } = getTranslation();
        return {
            code: unavailable ? ErrorCode.OUT_OF_STOCK : ErrorCode.OPERATION_FAILED,
            message: t(unavailable ? 'product:outOfStockLabel' : 'product:inventory.unavailable'),
        };
    }
    if (error instanceof ApiError) {
        const message = error.body?.detail || error.statusText || getErrorMessage(error);
        const code = mapStatusCode(error.status) ?? fallbackCode;
        return { code, message };
    }

    return {
        code: fallbackCode,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
}

function mapStatusCode(status: number): string | undefined {
    switch (status) {
        case 401:
            return ErrorCode.NOT_AUTHENTICATED;
        case 403:
            return ErrorCode.NOT_AUTHORIZED;
        case 404:
            return ErrorCode.NOT_FOUND;
        case 409:
            return ErrorCode.CONFLICT;
        case 429:
            return ErrorCode.RATE_LIMITED;
        default:
            return undefined;
    }
}

/**
 * Inverse of `mapStatusCode`. Returns the canonical HTTP status for an
 * `ErrorCode` so action routes don't have to spell out both halves of the pair
 * inline (and drift apart later). Codes without a canonical 1:1 status fall
 * through to 500.
 */
export function httpStatusForErrorCode(code: string): number {
    switch (code) {
        case ErrorCode.INVALID_INPUT:
        case ErrorCode.REQUIRED_FIELD:
            return 400;
        case ErrorCode.NOT_AUTHENTICATED:
            return 401;
        case ErrorCode.NOT_AUTHORIZED:
            return 403;
        case ErrorCode.NOT_FOUND:
            return 404;
        case ErrorCode.METHOD_NOT_ALLOWED:
            return 405;
        case ErrorCode.CONFLICT:
            return 409;
        case ErrorCode.EXPIRED:
            return 410;
        case ErrorCode.RATE_LIMITED:
            return 429;
        default:
            return 500;
    }
}
