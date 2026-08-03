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
import { Suspense, lazy, useMemo, createContext, useContext } from 'react';
import { isDesignModeActive, isPreviewModeActive } from '../../modeDetection';
import type { IsomorphicConfiguration } from '../../messaging-api';

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
    isShopperContextEnabled?: boolean;
    clientLogger?: IsomorphicConfiguration['logger'];
    clientConnectionTimeout?: number;
    clientConnectionInterval?: number;
    mode?: 'EDIT' | 'PREVIEW';
};

export const PageDesignerProvider = ({
    children,
    targetOrigin,
    clientId,
    usid,
    isShopperContextEnabled,
    clientLogger,
    clientConnectionTimeout,
    clientConnectionInterval,
    mode,
}: PageDesignerProviderProps): React.JSX.Element => {
    const contextValue = useMemo(
        () => ({
            isDesignMode: mode === 'EDIT' || isDesignModeActive(),
            isPreviewMode: mode === 'PREVIEW' || isPreviewModeActive(),
        }),
        [mode]
    );
    const { isDesignMode, isPreviewMode } = contextValue;

    if (isDesignMode && !targetOrigin) {
        throw new Error(
            'PageDesignerProvider: targetOrigin is required when in design mode for security reasons. ' +
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
                <LazyPreviewProvider>{content}</LazyPreviewProvider>
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
                    isShopperContextEnabled={isShopperContextEnabled}
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

PageDesignerProvider.defaultProps = {
    clientConnectionTimeout: 60_000,
    clientConnectionInterval: 1_000,
    mode: undefined,
    clientLogger: () => {
        // noop
    },
};
