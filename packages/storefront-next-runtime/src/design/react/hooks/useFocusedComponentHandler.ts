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
import { useDesignState } from './useDesignState';

/**
 * Focuses a component when the focused component id matches the content link UUID.
 * @param contentLinkUuid - The content link UUID of the component.
 * @param nodeRef - The ref object to the node to focus.
 * @param disabled - When true, the handler is inert. Embedded instances are not
 *   editable by the host, so they must never be focused / scrolled into view;
 *   the decorator passes its `isEmbedded` here to enforce that.
 */
export function useFocusedComponentHandler(
    contentLinkUuid: string,
    nodeRef: React.RefObject<Element | null>,
    disabled = false
): void {
    const { focusedContentLinkUuid, focusComponent } = useDesignState();

    React.useEffect(() => {
        if (!disabled && focusedContentLinkUuid === contentLinkUuid && nodeRef.current) {
            focusComponent(nodeRef.current);
        }
    }, [disabled, focusedContentLinkUuid, contentLinkUuid, focusComponent, nodeRef]);
}
