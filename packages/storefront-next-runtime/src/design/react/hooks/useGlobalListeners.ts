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
import { useEffect } from 'react';
import { useThrottledCallback } from './useThrottledCallback';
import { useDebouncedCallback } from './useDebouncedCallback';
import { useDesignSelector } from './useDesignSelector';

const FPS_60 = 1000 / 60;

export function useGlobalListeners(): void {
    const dropComponent = useDesignSelector((s) => s.dropComponent);
    const updateComponentMove = useDesignSelector((s) => s.updateComponentMove);
    const cancelDrag = useDesignSelector((s) => s.cancelDrag);
    const notifyWindowScrollChange = useDesignSelector((s) => s.notifyWindowScrollChange);

    const dragListener = useThrottledCallback(
        (event: DragEvent) => updateComponentMove({ x: event.clientX, y: event.clientY }),
        FPS_60,
        [updateComponentMove]
    );
    const scrollListener = useDebouncedCallback(() => notifyWindowScrollChange(window.scrollX, window.scrollY), 100, [
        notifyWindowScrollChange,
    ]);

    useEffect(() => {
        const dragEndListener = () => dropComponent();
        const mouseUpListener = () => cancelDrag();

        window.addEventListener('dragover', dragListener);
        window.addEventListener('dragend', dragEndListener);
        window.addEventListener('scroll', scrollListener);
        // We need to make sure we cancel dragging on mouseup since we
        // we are using mousedown to start dragging or else it would stay in a dragging
        // state from regular click events.
        window.addEventListener('mouseup', mouseUpListener);

        return () => {
            window.removeEventListener('dragover', dragListener);
            window.removeEventListener('dragend', dragEndListener);
            window.removeEventListener('mouseup', mouseUpListener);
            window.removeEventListener('scroll', scrollListener);
        };
    }, [dropComponent, cancelDrag, dragListener, scrollListener]);
}
