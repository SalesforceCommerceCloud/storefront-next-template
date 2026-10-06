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
import { useCallback } from 'react';
import { useLocation } from 'react-router';
import { useNavigate } from '@/hooks/use-navigate';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/auth';
import { useToast } from '@/components/toast';
import { routes } from '@/route-paths';

export interface RequireAuthOptions {
    actionName: string;
    getActionParams?: (...args: unknown[]) => Record<string, unknown>;
    /** Returns an application-relative path without the MRT base path. */
    getReturnUrl?: () => string;
    toastMessage?: string;
}

/**
 * Hook that wraps an action function to require authentication.
 * If the user is not authenticated, shows a toast with Sign In and Sign Up buttons,
 * preserves the action metadata, and redirects to auth pages with returnUrl.
 *
 * After authentication, the action will be automatically executed.
 *
 * @example
 * ```tsx
 * const handleAddToWishlist = useRequireAuth(
 *   async (productId: string) => {
 *     await addToWishlist(productId);
 *   },
 *   {
 *     actionName: 'addToWishlist',
 *     getActionParams: (productId) => ({ productId }),
 *     toastMessage: 'Sign in to add items to your wishlist'
 *   }
 * );
 * ```
 */
export function useRequireAuth<T extends (...args: unknown[]) => Promise<unknown>>(
    action: T,
    options: RequireAuthOptions
): T {
    const { t } = useTranslation();
    const session = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();

    return useCallback(
        async (...args: Parameters<T>) => {
            // Re-check auth state in case it changed (e.g., after signup/login)
            const currentIsAuthenticated = Boolean(session?.userType === 'registered' && session?.customerId);

            // If authenticated, execute action immediately
            if (currentIsAuthenticated) {
                return action(...args);
            }

            // Preserve action metadata - encode in returnUrl (URL-based approach)
            const actionParams = options.getActionParams?.(...args) || {};
            // React Router removes its basename from location.pathname, keeping this return target
            // application-relative so the server can apply the MRT base path exactly once.
            const baseReturnUrl = options.getReturnUrl?.() || location.pathname;

            // Build returnUrl with action params embedded (URL-based approach)
            const returnUrlWithAction = new URL(baseReturnUrl, window.location.origin);
            returnUrlWithAction.searchParams.set('action', options.actionName);
            if (Object.keys(actionParams).length > 0) {
                returnUrlWithAction.searchParams.set('actionParams', JSON.stringify(actionParams));
            }
            const encodedReturnUrl = returnUrlWithAction.pathname + returnUrlWithAction.search;

            // Build auth URLs with encoded returnUrl
            const baseAuthUrl = (path: string) => {
                const url = new URL(path, window.location.origin);
                url.searchParams.set('returnUrl', encodedReturnUrl);
                return url.pathname + url.search;
            };

            const loginUrl = baseAuthUrl(routes.login);
            const signupUrl = baseAuthUrl(routes.signup);

            // Show toast with Sign In and Sign Up buttons
            addToast(options.toastMessage || t('product:signInToContinue'), 'info', {
                duration: 8000, // Longer duration for actionable toast
                action: {
                    label: t('login:signIn'),
                    onClick: () => {
                        void navigate(loginUrl);
                    },
                },
                cancel: {
                    label: t('signup:form.createAccountButton'),
                    onClick: () => {
                        void navigate(signupUrl);
                    },
                },
            });

            // Return a rejected promise to indicate action was intercepted
            // Note: This error is internal and won't be displayed to users
            return Promise.reject(new Error('Authentication required'));
        },
        [session, action, options, navigate, location.pathname, addToast, t]
    ) as T;
}
