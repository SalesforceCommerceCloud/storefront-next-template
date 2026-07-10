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
import React from 'react';

const EmbeddedSubtreeContext = React.createContext<boolean>(false);

/**
 * Marks everything rendered beneath it as living in an embedded subtree — Page
 * Designer content the host cannot resolve for select / delete / move. The
 * template sets `embedded` from the embedded owner's `embedded` flag; the
 * design decorators read it via {@link useIsWithinEmbeddedSubtree} to suppress
 * their editing chrome.
 *
 * Nesting is sticky: once a subtree is embedded, descendants stay embedded even
 * if an inner provider passes `embedded={false}`, since embeddedness is a
 * property of the whole subtree, not any single boundary.
 */
export function EmbeddedSubtreeProvider({
    embedded,
    children,
}: {
    embedded: boolean;
    children: React.ReactNode;
}): React.JSX.Element {
    const parentEmbedded = React.useContext(EmbeddedSubtreeContext);
    return (
        <EmbeddedSubtreeContext.Provider value={parentEmbedded || embedded}>{children}</EmbeddedSubtreeContext.Provider>
    );
}

/**
 * Whether the caller is rendered within an {@link EmbeddedSubtreeProvider} that
 * was told the subtree is embedded. `false` when no provider is present, so
 * page content — which the template never wraps — is never treated as embedded.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useIsWithinEmbeddedSubtree(): boolean {
    return React.useContext(EmbeddedSubtreeContext);
}
