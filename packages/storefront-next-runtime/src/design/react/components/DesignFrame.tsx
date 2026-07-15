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
import { useComponentType } from '../hooks/useComponentType';
import { DeleteToolboxButton } from './DeleteToolboxButton';
import { MoveToolboxButton } from './MoveToolboxButton';
import { useDesignState } from '../hooks/useDesignState';
import { useLabels } from '../hooks/useLabels';
import { DesignOverlay } from './DesignOverlay';

export const DesignFrame = ({
    componentId,
    children,
    name,
    parentId,
    regionId,
    contentLinkUuid,
    localized = false,
    showFrame = false,
    showToolbox = true,
    isMoveable = true,
    isDeletable = true,
    className,
}: React.PropsWithChildren<{
    componentId?: string;
    name: string;
    localized?: boolean;
    parentId?: string;
    regionId?: string;
    contentLinkUuid?: string;
    showToolbox?: boolean;
    showFrame?: boolean;
    isMoveable?: boolean;
    isDeletable?: boolean;
    className?: string;
}>): React.JSX.Element => {
    const componentType = useComponentType(componentId ?? '');
    const { deleteComponent } = useDesignState();
    const labels = useLabels();
    const nodeRef = React.useRef<HTMLDivElement>(null);

    const handleDelete = React.useCallback(
        (event: React.MouseEvent) => {
            // Stop propagation so we don't select the component as well when
            // this bubbles up.
            event.stopPropagation();

            if (componentId) {
                deleteComponent({
                    componentId,
                    contentLinkUuid: contentLinkUuid ?? '',
                    sourceComponentId: parentId ?? '',
                    sourceRegionId: regionId ?? '',
                });
            }
        },
        [deleteComponent, componentId, contentLinkUuid, parentId, regionId]
    );

    const stopPropagation = (event: React.MouseEvent) => event.stopPropagation();

    const classes = ['pd-design__frame', showFrame && 'pd-design__frame--visible', className].filter(Boolean).join(' ');

    // TODO: For the frame label, when there is not enough space above the component to display it, we
    // need to display it inside the container instead.
    return (
        <div className={classes} ref={nodeRef}>
            {showFrame && (
                <>
                    <div className="pd-design__frame--x" />
                    <div className="pd-design__frame--y" />
                </>
            )}
            <div className="pd-design__frame__label" onMouseDown={stopPropagation}>
                {componentType?.image && (
                    <span className="pd-design__icon">
                        <img src={componentType.image} alt="" />
                    </span>
                )}
                <span className="pd-design__frame__name">{name}</span>
                {!localized && (
                    <span className="pd-design__frame__fallback-badge">{labels.fallback ?? 'Fallback'}</span>
                )}
            </div>
            {showToolbox && (isMoveable || isDeletable) && (
                <div className="pd-design__frame__toolbox">
                    {isMoveable && <MoveToolboxButton title={labels.moveComponent ?? 'Move component'} />}
                    {isDeletable && (
                        <DeleteToolboxButton
                            title={labels.deleteComponent ?? 'Delete component'}
                            onMouseDown={stopPropagation}
                            onClick={handleDelete}
                        />
                    )}
                </div>
            )}
            <DesignOverlay />
            {children}
        </div>
    );
};

DesignFrame.defaultProps = {
    parentId: undefined,
    componentId: undefined,
    showToolbox: true,
    regionId: undefined,
    showFrame: false,
};
