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
import { useLocation, useNavigation } from 'react-router';
import { useAuthFetcher as useFetcher } from '@/hooks/use-auth-fetcher';
import { useNavigate } from '@/hooks/use-navigate';
import { useAuth } from '@/providers/auth';
import { useToast } from '@/components/toast';
import type { ActionHandler, ActionResponse } from './action-registry';
import { getSearchWithoutActionParams } from './use-filters-panel-state';

/** Actions whose lifecycle is owned by the mounting component (not the root-level hook). */
const COMPONENT_HANDLED_ACTIONS = new Set(['addToWishlist']);

/**
 * Lazy-load the action registry only when needed.
 * This prevents bundling the registry (and uiStrings) in the initial page load.
 */
async function getActionRegistry(): Promise<Record<string, ActionHandler>> {
    const { actionRegistry } = await import('./action-registry');
    return actionRegistry;
}

/**
 * Hook that executes pending actions after authentication
 *
 * This hook should be called at the app level or in a layout component
 * that mounts after authentication state is available.
 *
 * @example
 * ```tsx
 * export default function Layout() {
 *   useExecutePendingAction();
 *   // ... rest of layout
 * }
 * ```
 */
export function useExecutePendingAction() {
    const location = useLocation();
    const navigation = useNavigation();
    const navigate = useNavigate();
    const session = useAuth();
    const { addToast } = useToast();
    const hasExecutedRef = useRef(false);
    const prevAuthenticatedRef = useRef<boolean>(false);

    // Track if we've seen the first render after navigation becomes idle
    // This ensures the page has been rendered before executing the action
    const hasSeenIdleRenderRef = useRef(false);
    const prevNavigationIdleRef = useRef<boolean>(false);

    // Create a generic fetcher that can be used for any action
    const actionFetcher = useFetcher<ActionResponse>();

    const isAuthenticated = Boolean(session?.userType === 'registered' && session?.customerId);

    // Reset execution flag when authentication state changes from false to true
    // This ensures the action executes after a fresh login
    if (isAuthenticated && !prevAuthenticatedRef.current) {
        hasExecutedRef.current = false;
        hasSeenIdleRenderRef.current = false; // Reset on fresh login
    }
    prevAuthenticatedRef.current = isAuthenticated;

    // Check if navigation is complete and ready for action execution
    const isNavigationIdle = navigation?.state === 'idle';

    // Track when navigation becomes idle
    // On the first render after navigation becomes idle, mark that we've seen it
    // On the second render (when hasSeenIdleRenderRef is true), we can execute
    if (isNavigationIdle && !prevNavigationIdleRef.current) {
        // Navigation just became idle - this is the first render, reset flag
        hasSeenIdleRenderRef.current = false;
    } else if (isNavigationIdle && prevNavigationIdleRef.current && !hasSeenIdleRenderRef.current) {
        // Navigation is idle and this is the first render after it became idle
        hasSeenIdleRenderRef.current = true;
    }
    prevNavigationIdleRef.current = isNavigationIdle;

    useEffect(() => {
        // Only execute if:
        // 1. User is authenticated
        // 2. We're on a page (not still on login/signup)
        // 3. Navigation is idle (page has loaded)
        // 4. We've seen at least one render after navigation became idle (page has been rendered)
        if (
            !isAuthenticated ||
            location.pathname === '/login' ||
            location.pathname === '/signup' ||
            !isNavigationIdle ||
            !hasSeenIdleRenderRef.current
        ) {
            // Reset execution flag if we're not ready yet
            if (!isNavigationIdle || !hasSeenIdleRenderRef.current) {
                hasExecutedRef.current = false;
            }
            return;
        }

        // Read action and params from URL query params (URL-based approach)
        const urlParams = new URLSearchParams(location.search);
        const actionName = urlParams.get('action');
        const actionParamsStr = urlParams.get('actionParams');

        if (!actionName) {
            return;
        }

        if (COMPONENT_HANDLED_ACTIONS.has(actionName)) {
            return;
        }

        // Prevent executing multiple times on the same page
        if (hasExecutedRef.current) {
            return;
        }

        hasExecutedRef.current = true;

        // Parse action params from URL
        let params: Record<string, unknown> = {};
        if (actionParamsStr) {
            try {
                params = JSON.parse(actionParamsStr);
            } catch {
                // Invalid JSON - clear URL params and return
                void navigate(
                    { pathname: location.pathname, search: getSearchWithoutActionParams(location.search) },
                    { replace: true }
                );
                hasExecutedRef.current = false;
                return;
            }
        }

        // Execute action - page has been rendered (we're on second render after idle)
        void (async () => {
            try {
                // Lazy-load action registry only when needed
                const registry = await getActionRegistry();

                // Look up action handler in registry
                const handler = registry[actionName];
                if (!handler) {
                    // Clear URL params and return
                    void navigate(
                        { pathname: location.pathname, search: getSearchWithoutActionParams(location.search) },
                        { replace: true }
                    );
                    hasExecutedRef.current = false;
                    return;
                }

                // Build FormData from params
                const formData = handler.buildFormData(params);

                // Execute action - URL params serve as the execution indicator
                // Components will check URL params directly to show loading states
                void actionFetcher.submit(formData, {
                    method: 'POST',
                    action: handler.actionRoute,
                });
            } catch {
                // Invalid JSON or other error - clear URL params
                void navigate(
                    { pathname: location.pathname, search: getSearchWithoutActionParams(location.search) },
                    { replace: true }
                );
                hasExecutedRef.current = false;
            }
        })();
    }, [isAuthenticated, location.pathname, location.search, isNavigationIdle, actionFetcher, navigate]);

    // Handle fetcher response and errors in a separate effect
    useEffect(() => {
        // Read action and params from URL query params (URL-based approach)
        const urlParams = new URLSearchParams(location.search);
        const actionName = urlParams.get('action');
        const actionParamsStr = urlParams.get('actionParams');

        if (!actionName) {
            // Not a pending action or already cleared
            return;
        }

        if (COMPONENT_HANDLED_ACTIONS.has(actionName)) {
            return;
        }

        // Parse action params from URL
        let params: Record<string, unknown> = {};
        if (actionParamsStr) {
            try {
                params = JSON.parse(actionParamsStr);
            } catch {
                // Invalid JSON - clear URL params and return
                void navigate(
                    { pathname: location.pathname, search: getSearchWithoutActionParams(location.search) },
                    { replace: true }
                );
                return;
            }
        }

        // Lazy-load action registry only when needed
        void getActionRegistry().then((registry) => {
            const handler = registry[actionName];
            if (!handler) {
                return;
            }

            // Handle completed response - URL params indicate action is executing
            // When fetcher completes, clear URL params
            if (actionFetcher.state === 'idle' && actionFetcher.data) {
                const result = actionFetcher.data;

                // Clear URL params - this signals to components that action is complete
                // Use navigate to ensure React Router's useLocation updates
                void navigate(
                    { pathname: location.pathname, search: getSearchWithoutActionParams(location.search) },
                    { replace: true }
                );
                hasExecutedRef.current = false;

                // Handle success or error based on result
                if (result.success) {
                    handler.handleSuccess(result, params, addToast);
                } else {
                    handler.handleError(result, params, addToast);
                }
            }

            // Handle error state (when fetcher fails)
            if (
                actionFetcher.state === 'idle' &&
                actionFetcher.data === undefined &&
                actionFetcher.formMethod === 'POST'
            ) {
                // Fetcher completed but no data - might be an error
                // Clear URL params to prevent stuck loading state
                void navigate(
                    { pathname: location.pathname, search: getSearchWithoutActionParams(location.search) },
                    { replace: true }
                );
            }
        });
    }, [
        location.pathname,
        location.search,
        actionFetcher.state,
        actionFetcher.data,
        actionFetcher.formMethod,
        addToast,
        navigate,
    ]);
}
