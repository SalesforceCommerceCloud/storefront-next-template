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
import { createContext, type PropsWithChildren, useCallback, useContext, useState } from 'react';
import type { DynamicImageDimensions } from '@/lib/images/dynamic-image';

type DynamicImageContextValue = {
    hasSource: (src: string) => boolean;
    addSource: (src: string) => boolean;
    widths: DynamicImageDimensions | undefined;
    heights: DynamicImageDimensions | undefined;
};

const DynamicImageContext = createContext<DynamicImageContextValue | null>(null);

/**
 * Optional provider for a dynamic image context to be consumed by nested `<DynamicImage/>` components.
 * The purpose of this provider is to enable consumers to mark certain dynamic image resources as high priority.
 * The deep nesting structure of our components and the complexity of determining applicable image resources based
 * on selected variation attributes and matching image groups, make a helper like this necessary.
 *
 * **Note:** The provider has two separate interfaces, one for the components within its scope and one for parents
 * initializing the context.
 * @see {@link import('@/components/dynamic-image').DynamicImage}
 */
const DynamicImageProvider = ({
    children,
    value,
}: PropsWithChildren<{
    value: {
        sources?: Set<string>;
        widths?: DynamicImageDimensions;
        heights?: DynamicImageDimensions;
        addSource?: (src: string, sources: Set<string>) => boolean;
        hasSource?: (src: string, sources: Set<string>) => boolean;
    };
}>) => {
    // Translate the internal-only interface to the public interface
    const [sources] = useState(value.sources ?? new Set<string>());
    const addSource = useCallback((src: string): boolean => !!value?.addSource?.(src, sources), [value, sources]);
    const hasSource = useCallback((src: string): boolean => !!value?.hasSource?.(src, sources), [value, sources]);
    return (
        <DynamicImageContext.Provider
            value={{
                addSource,
                hasSource,
                widths: value.widths && (Object.freeze(value.widths) as DynamicImageContextValue['widths']),
                heights: value.heights && (Object.freeze(value.heights) as DynamicImageContextValue['heights']),
            }}>
            {children}
        </DynamicImageContext.Provider>
    );
};

/**
 * Hook to access DynamicImage context. Returns null if no provider is present,
 * making the context optional.
 */
// oxlint-disable-next-line react-refresh/only-export-components
export const useDynamicImageContext = (): DynamicImageContextValue | null => {
    return useContext(DynamicImageContext);
};

export default DynamicImageProvider;
