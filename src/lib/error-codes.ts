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

export interface ActionError {
    code: string;
    message: string;
}

export const ErrorCode = {
    NOT_FOUND: 'NOT_FOUND',
    NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
    NOT_AUTHORIZED: 'NOT_AUTHORIZED',
    INVALID_INPUT: 'INVALID_INPUT',
    REQUIRED_FIELD: 'REQUIRED_FIELD',
    CONFLICT: 'CONFLICT',
    EXPIRED: 'EXPIRED',
    OPERATION_FAILED: 'OPERATION_FAILED',
    OUT_OF_STOCK: 'OUT_OF_STOCK',
    RATE_LIMITED: 'RATE_LIMITED',
    METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
    UNKNOWN: 'UNKNOWN',
    SCAPI_UNSUPPORTED: 'SCAPI_UNSUPPORTED',
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
} as const;
