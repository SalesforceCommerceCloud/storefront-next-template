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
import { createContext, useContext, useMemo, type ReactNode } from 'react';

const CriticalComponentContext = createContext<ReadonlySet<string> | undefined>(undefined);

export function CriticalComponentProvider({ children, value }: { children: ReactNode; value: readonly string[] }) {
    const componentIds = useMemo(() => new Set(value), [value]);
    return <CriticalComponentContext.Provider value={componentIds}>{children}</CriticalComponentContext.Provider>;
}

// oxlint-disable-next-line react-refresh/only-export-components
export function useIsCriticalComponent(componentId: string): boolean {
    return useContext(CriticalComponentContext)?.has(componentId) ?? false;
}
