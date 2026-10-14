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
import { useEffect, useRef } from 'react';
import type { FetcherWithComponents } from 'react-router';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

/**
 * Configuration object for the useFetcherEffect hook
 * @template TData - The type of data returned by the fetcher
 */
export interface FetcherEffectConfig<TData = unknown> {
    /** Callback function called when the fetcher operation succeeds */
    onSuccess?: (data: TData | undefined) => void;
    /** Callback function called when the fetcher operation fails; receives error message(s) and optional response data */
    onError?: (error: string | string[], data?: TData) => void;
    /** Override the default error extractor when the action returns a non-string error shape */
    getError?: (data: TData) => string | string[] | undefined;
}

/**
 * Helper function to determine if data indicates success.
 * Checks for common success patterns: `success === true` or truthy data.
 */
function defaultIsSuccess<TData>(data: TData | undefined): boolean {
    if (data === undefined || data === null) {
        return false;
    }
    // Check if data has a success property - if it exists, use it as the source of truth
    if (typeof data === 'object' && 'success' in data) {
        return (data as { success?: boolean }).success === true;
    }
    // Otherwise, consider truthy data as success (including 0, false, empty string as valid responses)
    // Distinguish between "no data" (undefined/null) and "data that is a falsy value"
    return true;
}

/**
 * Helper function to extract error messages from data.
 * Checks for common error patterns: `error` or `errors` properties.
 */
function defaultGetError<TData>(data: TData | undefined): string | string[] | undefined {
    if (data === undefined || data === null) {
        return undefined;
    }
    if (typeof data === 'object') {
        // Check for error property (string)
        if ('error' in data && typeof (data as { error?: unknown }).error === 'string') {
            return (data as { error: string }).error;
        }
        // Check for errors property (array of strings)
        // Empty array is considered valid (indicates failure with no specific errors)
        if ('errors' in data && Array.isArray((data as { errors?: unknown }).errors)) {
            const errors = (data as { errors: unknown[] }).errors;
            if (errors.every((e) => typeof e === 'string')) {
                return errors;
            }
        }
    }
    return undefined;
}

/**
 * A helper hook that provides a convenient way to handle success and error callbacks
 * for React Router Fetcher operations. This hook watches the fetcher's state and calls
 * the appropriate callbacks when the operation completes.
 *
 * This is particularly useful for form implementations and other scenarios where
 * you need to react to the completion of fetcher operations without manually
 * checking the fetcher's state in useEffect.
 *
 * @template TData - The type of data returned by the fetcher
 * @param fetcher - The fetcher instance from React Router's useFetcher hook
 * @param config - Configuration object containing onSuccess and onError callbacks
 *
 * @example
 * ```tsx
 * import { useFetcher } from 'react-router';
 * import { useFetcherEffect } from '@/hooks/use-fetcher-effect';
 *
 * export default function MyForm() {
 *   const fetcher = useFetcher<{ success: boolean; error?: string }>();
 *
 *   useFetcherEffect(fetcher, {
 *     onSuccess: (data) => {
 *       console.log('Operation succeeded:', data);
 *       // Handle success (e.g., show success message, redirect, etc.)
 *     },
 *     onError: (error) => {
 *       console.error('Operation failed:', error);
 *       // Handle error (e.g., show error message, reset form, etc.)
 *     }
 *   });
 *
 *   const handleSubmit = (formData) => {
 *     fetcher.submit(formData, { method: 'POST', action: '/api/endpoint' });
 *   };
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       // form fields
 *     </form>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Using with load operations
 * export default function ProductList() {
 *   const fetcher = useFetcher<{ products: Product[] }>();
 *
 *   useFetcherEffect(fetcher, {
 *     onSuccess: (data) => {
 *       setProducts(data?.products || []);
 *     },
 *     onError: (error) => {
 *       setError(Array.isArray(error) ? error.join(', ') : error);
 *     }
 *   });
 *
 *   useEffect(() => {
 *     fetcher.load('/api/products');
 *   }, [fetcher]);
 *
 *   return <div>// render products</div>;
 * }
 * ```
 */
export function useFetcherEffect<TData = unknown>(
    fetcher: FetcherWithComponents<TData>,
    config: FetcherEffectConfig<TData>
): void {
    const { onSuccess, onError, getError } = config;

    // Track the previous state to detect changes
    const previousStateRef = useRef<string | undefined>(undefined);
    // Track which data we've already processed (by reference) to prevent duplicate callbacks
    const processedDataRef = useRef<TData | undefined>(undefined);

    useEffect(() => {
        const currentState = fetcher.state;
        const currentData = fetcher.data;

        // Only process when the state has changed and we're in idle or loading state with data
        // Loading state with data means the action completed but revalidation is happening
        const stateChanged = previousStateRef.current !== currentState;
        const hasCompletedOperation =
            currentState === 'idle' || (currentState === 'loading' && currentData !== undefined);
        const hasUnprocessedData = currentData !== undefined && currentData !== processedDataRef.current;

        if (stateChanged && hasCompletedOperation && hasUnprocessedData) {
            // Check if the operation was successful
            const success = defaultIsSuccess(currentData);
            const error = getError && currentData !== undefined ? getError(currentData) : defaultGetError(currentData);

            if (success && onSuccess) {
                try {
                    onSuccess(currentData);
                    // Mark this data as processed
                    processedDataRef.current = currentData;
                } catch (callbackError) {
                    logger.error('Error in onSuccess callback', { error: callbackError });
                }
            } else if (!success && error !== undefined && onError) {
                try {
                    onError(error, currentData);
                    // Mark this data as processed
                    processedDataRef.current = currentData;
                } catch (callbackError) {
                    logger.error('Error in onError callback', { error: callbackError });
                }
            }
        }

        // Update ref with current state
        previousStateRef.current = currentState;
    }, [fetcher, onSuccess, onError, getError]);
}
