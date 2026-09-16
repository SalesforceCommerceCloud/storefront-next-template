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
import { Suspense, lazy, useEffect, useMemo, useState, createContext, useContext } from 'react';
import { isDesignModeActive, isPreviewModeActive } from '../../modeDetection';
import type { IsomorphicConfiguration } from '../../messaging-api';
import type { PageUpdateMode } from './component.types';

// Lazy load the context providers so that they are only loaded when needed and don't impact runtime performance
const LazyDesignProvider = lazy(() =>
    import('../context/DesignContext').then((module) => ({
        default: module.DesignProvider,
    }))
);

const LazyPreviewProvider = lazy(() =>
    import('../context/PreviewContext').then((module) => ({
        default: module.PreviewProvider,
    }))
);

// Fallback component for loading states
const LoadingFallback: React.FC = () => null;

// Module-scoped so identity is stable across renders — an inline `() => {}` default
// would create a new function every render, busting downstream memoization in
// PreviewProvider / DesignProvider that keys on `clientLogger`.
const noopLogger: IsomorphicConfiguration['logger'] = () => {
    /* noop */
};

// PageDesigner context to expose mode information to children
type PageDesignerContextType = {
    isDesignMode: boolean;
    isPreviewMode: boolean;
};

// oxlint-disable-next-line react-refresh/only-export-components
export const PageDesignerContext = createContext<PageDesignerContextType>({
    isDesignMode: false,
    isPreviewMode: false,
});

// Hook to access PageDesigner mode information
// oxlint-disable-next-line react-refresh/only-export-components
export const usePageDesignerMode = (): PageDesignerContextType => useContext(PageDesignerContext);

type PageDesignerProviderProps = {
    children: React.ReactNode;
    clientId: string;
    targetOrigin: string;
    usid?: string;
    clientLogger?: IsomorphicConfiguration['logger'];
    clientConnectionTimeout?: number;
    clientConnectionInterval?: number;
    pageUpdateMode?: PageUpdateMode;
    mode?: 'EDIT' | 'PREVIEW';
};

export const PageDesignerProvider = ({
    children,
    targetOrigin,
    clientId,
    usid,
    pageUpdateMode,
    clientLogger = noopLogger,
    clientConnectionTimeout = 60_000,
    clientConnectionInterval = 1_000,
    mode,
}: PageDesignerProviderProps): React.JSX.Element => {
    // Page Designer mode is sticky for the lifetime of the client-side session. `mode` (from the
    // host's loader) and `?mode=...` in the URL are only present on the initial load; internal
    // client-side navigations drop the query param, and the root loader re-runs and returns
    // undefined. Without the latch below, `PreviewProvider` would unmount on the first inner
    // navigation, killing the messaging channel and the preview URL-bar tracking.
    const [stickyMode, setStickyMode] = useState<'EDIT' | 'PREVIEW' | undefined>(() => {
        if (mode) return mode;
        if (isDesignModeActive()) return 'EDIT';
        if (isPreviewModeActive()) return 'PREVIEW';
        return undefined;
    });
    useEffect(() => {
        if (mode && mode !== stickyMode) {
            setStickyMode(mode);
        }
    }, [mode, stickyMode]);

    const contextValue = useMemo(
        () => ({
            isDesignMode: stickyMode === 'EDIT',
            isPreviewMode: stickyMode === 'PREVIEW',
        }),
        [stickyMode]
    );
    const { isDesignMode, isPreviewMode } = contextValue;

    if ((isDesignMode || isPreviewMode) && !targetOrigin) {
        throw new Error(
            'PageDesignerProvider: targetOrigin is required in design and preview modes for security reasons. ' +
                'This should be the origin of the host application that contains this iframe '
        );
    }

    // If no special mode is active, just render children without loading contexts
    if (!isDesignMode && !isPreviewMode) {
        return <>{children}</>;
    }

    let content = children;

    if (isPreviewMode) {
        content = (
            <Suspense fallback={<LoadingFallback />}>
                <LazyPreviewProvider
                    targetOrigin={targetOrigin}
                    clientId={clientId}
                    usid={usid}
                    clientLogger={clientLogger}
                    clientConnectionTimeout={clientConnectionTimeout}
                    clientConnectionInterval={clientConnectionInterval}>
                    {content}
                </LazyPreviewProvider>
            </Suspense>
        );
    }

    if (isDesignMode) {
        content = (
            <Suspense fallback={<LoadingFallback />}>
                <LazyDesignProvider
                    targetOrigin={targetOrigin}
                    clientId={clientId}
                    usid={usid}
                    pageUpdateMode={pageUpdateMode}
                    clientLogger={clientLogger}
                    clientConnectionTimeout={clientConnectionTimeout}
                    clientConnectionInterval={clientConnectionInterval}>
                    {content}
                </LazyDesignProvider>
            </Suspense>
        );
    }

    return <PageDesignerContext.Provider value={contextValue}>{content}</PageDesignerContext.Provider>;
};
