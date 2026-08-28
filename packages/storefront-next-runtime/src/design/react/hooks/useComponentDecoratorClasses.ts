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
import { useDesignSelector } from './useDesignSelector';

export function useComponentDecoratorClasses({
    contentLinkUuid,
    isFragment,
    isLocalized,
}: {
    contentLinkUuid: string;
    isFragment: boolean;
    isLocalized: boolean;
}): string {
    const isSelected = useDesignSelector((s) => s.selectedContentLinkUuid === contentLinkUuid);
    const isHoveredContentLink = useDesignSelector((s) => s.hoveredContentLinkUuid === contentLinkUuid);
    const isHovered = useDesignSelector((s) => isHoveredContentLink && !s.dragState.isDragging);
    const showFrame = useDesignSelector((s) => (isSelected || isHovered) && !s.dragState.isDragging);
    const isSourceContentLinkUuid = useDesignSelector((s) => s.dragState.sourceContentLinkUuid === contentLinkUuid);
    const isMoving = useDesignSelector((s) => s.dragState.isDragging && isSourceContentLinkUuid);
    const isDropTarget = useDesignSelector((s) => s.dragState.currentDropTarget?.contentLinkUuid === contentLinkUuid);
    const dropTargetClass = useDesignSelector((s) => {
        const insertType = s.dragState.currentDropTarget?.insertType;

        if (isDropTarget && insertType?.axis && insertType?.type) {
            return `pd-design__drop-target__${insertType.axis}-${insertType.type}`;
        }

        return null;
    });

    return [
        'pd-design__decorator',
        isFragment ? 'pd-design__fragment' : 'pd-design__component',
        showFrame && 'pd-design__frame--visible',
        isSelected && 'pd-design__decorator--selected',
        isHovered && 'pd-design__decorator--hovered',
        isMoving && 'pd-design__decorator--moving',
        !isLocalized && 'pd-design__component--unlocalized',
        dropTargetClass,
    ]
        .filter(Boolean)
        .join(' ');
}
