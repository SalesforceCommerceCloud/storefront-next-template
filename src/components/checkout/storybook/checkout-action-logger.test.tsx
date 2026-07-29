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
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CheckoutActionLogger } from './checkout-action-logger';

const actionMocks = new Map<string, ReturnType<typeof vi.fn>>();

vi.mock('storybook/actions', () => ({
    action: (name: string) => {
        const fn = vi.fn();
        actionMocks.set(name, fn);
        return fn;
    },
}));

const getAction = (name: string) => {
    const fn = actionMocks.get(name);
    if (!fn) throw new Error(`No action mock registered for "${name}"`);
    return fn;
};

// jsdom defines `isTrusted` as a non-configurable own property on every Event, so we can't
// flip it via defineProperty. Instead, wrap `addEventListener` so listeners receive a proxy
// that reports `isTrusted: true` when we've tagged the event with TRUSTED_MARKER. This lets
// tests exercise the real-user paths that the logger filters synthetic events out of.
const TRUSTED_MARKER = '__trusted' as const;
type Trustable = Event & { [TRUSTED_MARKER]?: boolean };

beforeAll(() => {
    // oxlint-disable-next-line @typescript-eslint/unbound-method
    const origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function patched(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
    ) {
        if (!listener) return origAdd.call(this, type, listener, options);
        const wrapped: EventListener = (event) => {
            const proxy = new Proxy(event, {
                get(target, prop, receiver) {
                    if (prop === 'isTrusted' && (target as Trustable)[TRUSTED_MARKER]) return true;
                    const value = Reflect.get(target, prop, receiver);
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });
            if (typeof listener === 'function') return listener.call(this, proxy);
            return listener.handleEvent(proxy);
        };
        return origAdd.call(this, type, wrapped, options);
    };
});

const dispatchTrusted = (target: EventTarget, event: Event) => {
    (event as Trustable)[TRUSTED_MARKER] = true;
    target.dispatchEvent(event);
};

describe('CheckoutActionLogger', () => {
    beforeEach(() => {
        actionMocks.clear();
    });

    it('ignores synthetic (isTrusted=false) events from userEvent', async () => {
        const user = userEvent.setup();
        const { getByRole } = render(
            <CheckoutActionLogger name="ex">
                <button type="button">Click me</button>
            </CheckoutActionLogger>
        );

        await user.click(getByRole('button', { name: /click me/i }));

        expect(getAction('ex-click')).not.toHaveBeenCalled();
    });

    it('logs click with derived label on a trusted click', () => {
        const { getByRole } = render(
            <CheckoutActionLogger name="ex">
                <button type="button">Save address</button>
            </CheckoutActionLogger>
        );

        dispatchTrusted(getByRole('button'), new MouseEvent('click', { bubbles: true }));

        expect(getAction('ex-click')).toHaveBeenCalledWith({ label: 'Save address' });
        expect(getAction('ex-edit')).not.toHaveBeenCalled();
    });

    it('logs edit instead of click when button label contains "edit"', () => {
        const { getByRole } = render(
            <CheckoutActionLogger name="ex">
                <button type="button">Edit shipping</button>
            </CheckoutActionLogger>
        );

        dispatchTrusted(getByRole('button'), new MouseEvent('click', { bubbles: true }));

        expect(getAction('ex-edit')).toHaveBeenCalledWith({ label: 'Edit shipping' });
        expect(getAction('ex-click')).not.toHaveBeenCalled();
    });

    it('does not log a click for submit-type buttons (deferred to submit handler)', () => {
        const { getByRole } = render(
            <CheckoutActionLogger name="ex">
                <form onSubmit={(e) => e.preventDefault()}>
                    <button type="submit">Continue</button>
                </form>
            </CheckoutActionLogger>
        );

        dispatchTrusted(getByRole('button'), new MouseEvent('click', { bubbles: true }));

        expect(getAction('ex-click')).not.toHaveBeenCalled();
    });

    it('logs submit with the submitter label on form submit', () => {
        const { getByRole } = render(
            <CheckoutActionLogger name="ex">
                <form>
                    <button type="submit">Continue</button>
                </form>
            </CheckoutActionLogger>
        );

        // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
        const form = getByRole('button').closest('form')!;
        const submit = new Event('submit', { bubbles: true, cancelable: true });
        Object.defineProperty(submit, 'submitter', { value: getByRole('button') });
        dispatchTrusted(form, submit);

        expect(getAction('ex-submit')).toHaveBeenCalledWith({ label: 'Continue' });
    });

    it('prefers aria-label over text content when deriving labels', () => {
        const { getByRole } = render(
            <CheckoutActionLogger name="ex">
                <button type="button" aria-label="Close dialog">
                    X
                </button>
            </CheckoutActionLogger>
        );

        dispatchTrusted(getByRole('button'), new MouseEvent('click', { bubbles: true }));

        expect(getAction('ex-click')).toHaveBeenCalledWith({ label: 'Close dialog' });
    });

    it('logs input and input-value on text input change, and dedupes identical values', () => {
        const { getByRole } = render(
            <CheckoutActionLogger name="ex">
                <label>
                    Email
                    <input type="text" name="email" />
                </label>
            </CheckoutActionLogger>
        );

        const input = getByRole('textbox') as HTMLInputElement;
        input.value = 'jane@example.com';
        dispatchTrusted(input, new Event('input', { bubbles: true }));

        expect(getAction('ex-input')).toHaveBeenCalledTimes(1);
        expect(getAction('ex-input')).toHaveBeenCalledWith({ label: 'Email' });
        expect(getAction('ex-input-value')).toHaveBeenCalledWith({ label: 'Email', value: 'jane@example.com' });

        // Same value again — input-value should not fire a second time
        dispatchTrusted(input, new Event('input', { bubbles: true }));
        expect(getAction('ex-input-value')).toHaveBeenCalledTimes(1);

        // New value — fires again
        input.value = 'jane2@example.com';
        dispatchTrusted(input, new Event('input', { bubbles: true }));
        expect(getAction('ex-input-value')).toHaveBeenCalledTimes(2);
    });

    it('logs option-select on radio change', () => {
        const { getAllByRole } = render(
            <CheckoutActionLogger name="ex">
                <fieldset>
                    <legend>Shipping</legend>
                    <label>
                        <input type="radio" name="ship" value="standard" aria-label="Standard" />
                        Standard
                    </label>
                    <label>
                        <input type="radio" name="ship" value="express" aria-label="Express" />
                        Express
                    </label>
                </fieldset>
            </CheckoutActionLogger>
        );

        const [, express] = getAllByRole('radio') as HTMLInputElement[];
        express.checked = true;
        dispatchTrusted(express, new Event('change', { bubbles: true }));

        expect(getAction('ex-option-select')).toHaveBeenCalledWith({ label: 'Express', value: 'express' });
    });

    it('logs input-focus when a text input gains focus', () => {
        const { getByRole } = render(
            <CheckoutActionLogger name="ex">
                <label>
                    Phone
                    <input type="text" />
                </label>
            </CheckoutActionLogger>
        );

        dispatchTrusted(getByRole('textbox'), new FocusEvent('focusin', { bubbles: true }));

        expect(getAction('ex-input-focus')).toHaveBeenCalledWith({ label: 'Phone' });
    });

    it('logs hover once per element entry (no duplicate fires while still inside)', () => {
        const { getByRole } = render(
            <CheckoutActionLogger name="ex">
                <button type="button">Hover me</button>
            </CheckoutActionLogger>
        );

        const button = getByRole('button');
        dispatchTrusted(button, new PointerEvent('pointerover', { bubbles: true }));
        dispatchTrusted(button, new PointerEvent('pointerover', { bubbles: true }));

        expect(getAction('ex-hover')).toHaveBeenCalledTimes(1);
        expect(getAction('ex-hover')).toHaveBeenCalledWith({ label: 'Hover me' });
    });
});
