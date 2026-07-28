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

import { useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface ToastOptions {
    duration?: number;
    action?: ToastAction;
    cancel?: ToastAction;
    description?: ReactNode;
    className?: string;
}

/**
 * Custom hook for toast notifications using sonner
 */
export function useToast() {
    const addToast = useCallback((message: string, type: ToastType = 'info', options?: ToastOptions | number) => {
        // Support legacy API where duration is passed as third parameter
        const duration = typeof options === 'number' ? options : (options?.duration ?? 5000);
        const toastOptions = typeof options === 'number' ? {} : (options ?? {});

        const sonnerOptions = {
            duration,
            ...((toastOptions.action || toastOptions.cancel) && { closeButton: false as const }),
            ...(toastOptions.action && {
                action: {
                    label: toastOptions.action.label,
                    onClick: toastOptions.action.onClick,
                },
            }),
            ...(toastOptions.cancel && {
                cancel: {
                    label: toastOptions.cancel.label,
                    onClick: toastOptions.cancel.onClick,
                },
            }),
            ...(toastOptions.description && {
                description: toastOptions.description,
            }),
            ...(toastOptions.className && {
                className: toastOptions.className,
            }),
        };

        switch (type) {
            case 'success':
                return toast.success(message, sonnerOptions);
            case 'error':
                return toast.error(message, sonnerOptions);
            default:
                return toast(message, sonnerOptions);
        }
    }, []);

    return { addToast };
}

// Re-export toast and Toaster from sonner for convenience
export { toast, Toaster } from 'sonner';

// Pre-configured Toaster wrapper with app-wide defaults (position, offset, icons)
export { AppToaster } from './app-toaster';
