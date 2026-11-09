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
import { useEffect, useRef, type ReactNode } from 'react';
import { action } from 'storybook/actions';

type ActionLoggerProps = {
    children: ReactNode;
    selector?: string;
    clickSelector?: string;
    changeSelector?: string;
    preventDefault?: boolean;
    stopPropagation?: boolean;
    preventDefaultOnAnyClick?: boolean;
    stopPropagationOnAnyClick?: boolean;
    capture?: boolean;
    onClick?: (element: HTMLElement, event: MouseEvent, log: ActionLoggerLog) => void;
    onChange?: (element: HTMLElement, event: Event, log: ActionLoggerLog) => void;
};

export type ActionLoggerLog = (name: string, payload: unknown) => void;

const interactiveSelector = 'button, a, [role="button"]';

/**
 * Logs delegated story interactions to the Storybook Actions panel.
 *
 * The optional callback keeps story-specific action names and payloads close to
 * their story while this decorator owns event delegation and listener cleanup.
 */
export function ActionLogger({
    children,
    selector = interactiveSelector,
    clickSelector,
    changeSelector,
    preventDefault = false,
    stopPropagation = false,
    preventDefaultOnAnyClick = false,
    stopPropagationOnAnyClick = false,
    capture = true,
    onClick,
    onChange,
}: ActionLoggerProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        if (!root) return;

        const log: ActionLoggerLog = (name, payload) => action(name)(payload);
        const handleClick = (event: MouseEvent) => {
            if (preventDefaultOnAnyClick) event.preventDefault();
            if (stopPropagationOnAnyClick) event.stopPropagation();

            const target = event.target;
            if (!(target instanceof Element)) return;
            const element = target.closest(clickSelector ?? selector);
            if (!(element instanceof HTMLElement) || !root.contains(element)) return;

            if (preventDefault) event.preventDefault();
            if (stopPropagation) event.stopPropagation();

            if (onClick) {
                onClick(element, event, log);
                return;
            }

            log('interaction', getInteractionPayload(element));
        };

        const handleChange = (event: Event) => {
            if (!onChange || !changeSelector) return;

            const target = event.target;
            if (!(target instanceof Element)) return;
            const element = target.closest(changeSelector);
            if (!(element instanceof HTMLElement) || !root.contains(element)) return;

            onChange(element, event, log);
        };

        root.addEventListener('click', handleClick, capture);
        root.addEventListener('change', handleChange, capture);
        return () => {
            root.removeEventListener('click', handleClick, capture);
            root.removeEventListener('change', handleChange, capture);
        };
    }, [
        capture,
        changeSelector,
        clickSelector,
        onChange,
        onClick,
        preventDefault,
        preventDefaultOnAnyClick,
        selector,
        stopPropagation,
        stopPropagationOnAnyClick,
    ]);

    return <div ref={containerRef}>{children}</div>;
}

export function getInteractionPayload(element: HTMLElement) {
    return {
        type: 'click',
        tag: element.tagName.toLowerCase(),
        label: element.textContent?.trim().substring(0, 50) || 'unlabeled',
    };
}
