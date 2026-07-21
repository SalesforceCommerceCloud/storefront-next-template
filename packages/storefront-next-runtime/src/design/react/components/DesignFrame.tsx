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

    // The frame label normally sits one label-height above the component. When
    // there isn't room above it — e.g. the content block editor renders the
    // block flush to the top of the viewport — the label would be clipped, so
    // render it inside the top edge instead. The effect runs once the frame is
    // visible, at which point the label is laid out and its height is readable.
    const [labelInside, setLabelInside] = React.useState(false);
    React.useLayoutEffect(() => {
        const frame = nodeRef.current;
        if (!showFrame || !frame) {
            return;
        }
        const labelHeight =
            frame.querySelector<HTMLElement>('.pd-design__frame__label')?.getBoundingClientRect().height ?? 0;
        setLabelInside(frame.getBoundingClientRect().top < labelHeight);
    }, [showFrame]);

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
    const labelClasses = ['pd-design__frame__label', labelInside && 'pd-design__frame__label--inside']
        .filter(Boolean)
        .join(' ');

    return (
        <div className={classes} ref={nodeRef}>
            {showFrame && (
                <>
                    <div className="pd-design__frame--x" />
                    <div className="pd-design__frame--y" />
                </>
            )}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Page Designer design-mode frame label; onMouseDown only stops drag propagation, not an interactive control */}
            <div className={labelClasses} onMouseDown={stopPropagation}>
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
