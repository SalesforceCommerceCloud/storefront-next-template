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
import React, { useCallback } from 'react';
import type { RegionDecoratorProps } from '../core/component.types';
import { useRegionDecoratorClasses } from '../hooks/useRegionDecoratorClasses';
import { useNodeToTargetStore } from '../hooks/useNodeToTargetStore';
import { DesignFrame } from './DesignFrame';
import { useLabels } from '../hooks/useLabels';
import { RegionContext, type RegionContextType } from '../core/RegionContext';
import { useIsWithinEmbeddedSubtree } from '../core/EmbeddedSubtreeContext';
import { useComponentContext } from '../core/ComponentContext';
import { useDesignState } from '../hooks/useDesignState';
import { isComponentTypeAllowedInRegion } from '../utils/regionUtils';

export function DesignRegion(props: RegionDecoratorProps<unknown>): React.JSX.Element {
    const { designMetadata, children, className } = props;
    const {
        name,
        id = '',
        contentLinkUuids = [],
        componentTypeInclusions = [],
        componentTypeExclusions = [],
    } = designMetadata ?? {};
    const nodeRef = React.useRef<HTMLDivElement>(null);
    const classes = useRegionDecoratorClasses({
        regionId: id,
        componentTypeInclusions,
        componentTypeExclusions,
    });
    const { dragState } = useDesignState();
    const labels = useLabels();
    // Embedded regions can't accept drops or be edited, so they show no frame
    // and aren't registered as drop targets. The embedded owner declares the
    // subtree via the provider, keyed on its own `embedded` flag — the sole
    // source of truth, so an empty embedded region is covered too.
    const isEmbedded = useIsWithinEmbeddedSubtree();
    const showFrame = Boolean(id && dragState.currentDropTarget?.regionId === id);
    const { contentLinkUuid: parentContentLinkUuid } = useComponentContext() ?? {};

    useNodeToTargetStore({
        type: 'region',
        nodeRef,
        parentId: parentContentLinkUuid,
        contentLinkUuids,
        regionId: id,
        componentTypeInclusions,
        componentTypeExclusions,
        disabled: isEmbedded,
    });

    const context = React.useMemo<RegionContextType>(
        () => ({ regionId: id, contentLinkUuids }),
        [id, contentLinkUuids]
    );

    const handleDragOver = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            const isComponentAllowed = isComponentTypeAllowedInRegion(
                dragState.componentType,
                componentTypeInclusions,
                componentTypeExclusions
            );

            if (isComponentAllowed) {
                event.preventDefault();
            }
        },
        [dragState.componentType, componentTypeInclusions, componentTypeExclusions]
    );

    // An embedded region can't accept drops or be edited, so render its children
    // as static content with no design frame or drop handler. The hooks above
    // still run (Rules of Hooks); the target store is disabled for this subtree.
    if (isEmbedded) {
        return <RegionContext.Provider value={context}>{children}</RegionContext.Provider>;
    }

    return (
        <div className={classes} ref={nodeRef} onDragOver={handleDragOver} data-region-id={id}>
            <DesignFrame
                name={name ?? labels.defaultRegionName ?? 'Region'}
                regionId={id}
                localized
                showFrame={showFrame}
                showToolbox={false}
                className={className}>
                <RegionContext.Provider value={context}>{children}</RegionContext.Provider>
            </DesignFrame>
        </div>
    );
}
