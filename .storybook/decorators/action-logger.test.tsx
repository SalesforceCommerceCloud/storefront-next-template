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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ActionLogger } from './action-logger';

const actionMocks = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock('storybook/actions', () => ({
    action: (name: string) => {
        const mock = vi.fn();
        actionMocks.set(name, mock);
        return mock;
    },
}));

const getAction = (name: string) => {
    const mock = actionMocks.get(name);
    if (!mock) throw new Error(`No action mock registered for "${name}"`);
    return mock;
};

describe('ActionLogger', () => {
    beforeEach(() => actionMocks.clear());
    afterEach(cleanup);

    it('logs delegated interactive clicks with the default payload', () => {
        const { getByRole } = render(
            <ActionLogger>
                <button type="button">
                    <span>Open cart</span>
                </button>
            </ActionLogger>
        );

        fireEvent.click(getByRole('button'));

        expect(getAction('interaction')).toHaveBeenCalledWith({ type: 'click', tag: 'button', label: 'Open cart' });
    });

    it('passes the matched element to custom handlers', () => {
        const onClick = vi.fn((element: HTMLElement, _event: MouseEvent, log) => {
            log('custom-action', { label: element.textContent });
        });
        const { getByRole } = render(
            <ActionLogger onClick={onClick}>
                <button type="button">Add to cart</button>
            </ActionLogger>
        );

        fireEvent.click(getByRole('button'));

        expect(onClick).toHaveBeenCalledWith(expect.any(HTMLButtonElement), expect.any(MouseEvent), expect.any(Function));
        expect(getAction('custom-action')).toHaveBeenCalledWith({ label: 'Add to cart' });
    });

    it('only prevents matching clicks unless configured for every click', () => {
        const { container, getByRole } = render(
            <ActionLogger selector="button" preventDefault>
                <span>Category</span>
                <button type="button">Save</button>
            </ActionLogger>
        );
        const linkEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
        const buttonEvent = new MouseEvent('click', { bubbles: true, cancelable: true });

        container.querySelector('span')!.dispatchEvent(linkEvent);
        getByRole('button').dispatchEvent(buttonEvent);

        expect(linkEvent.defaultPrevented).toBe(false);
        expect(buttonEvent.defaultPrevented).toBe(true);
    });

    it('can prevent every click before matching an interactive target', () => {
        const { getByText } = render(
            <ActionLogger preventDefaultOnAnyClick>
                <span>Noninteractive</span>
            </ActionLogger>
        );
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });

        getByText('Noninteractive').dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(actionMocks.size).toBe(0);
    });

    it('delegates change events and removes listeners on unmount', () => {
        const onChange = vi.fn((_element: HTMLElement, _event: Event, log) => log('selection', { value: 'pickup' }));
        const { getByRole, unmount } = render(
            <ActionLogger changeSelector="input" onChange={onChange}>
                <input type="radio" value="pickup" />
            </ActionLogger>
        );
        const input = getByRole('radio');

        fireEvent.change(input);
        unmount();
        fireEvent.change(input);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(getAction('selection')).toHaveBeenCalledTimes(1);
    });
});
