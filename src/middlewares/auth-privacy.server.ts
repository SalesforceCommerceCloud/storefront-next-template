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
import type { MiddlewareFunction } from 'react-router';
import { applyAuthPrivacyHeaders } from '@/lib/auth/privacy.server';

/** Outermost response policy so shared error/backoff handlers cannot make auth-bound responses cacheable. */
export const authPrivacyMiddleware: MiddlewareFunction<Response> = async ({ request }, next) => {
    try {
        const response = await next();
        applyAuthPrivacyHeaders(request, response.headers);
        return response;
    } catch (error) {
        if (error instanceof Response) applyAuthPrivacyHeaders(request, error.headers);
        throw error;
    }
};
