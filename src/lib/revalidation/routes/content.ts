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
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { getActionPath, isAmbientMutation } from './shared';

/** Avoid refetching standalone content after unrelated actions while preserving content navigation. */
export function shouldRevalidate({
    currentUrl,
    nextUrl,
    formMethod,
    formAction,
    defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
    if (formMethod && formMethod !== 'GET') {
        const actionPath = getActionPath(formAction, currentUrl.origin);
        return Boolean(actionPath && isAmbientMutation(actionPath));
    }

    if (currentUrl.pathname !== nextUrl.pathname) return true;
    return defaultShouldRevalidate;
}
