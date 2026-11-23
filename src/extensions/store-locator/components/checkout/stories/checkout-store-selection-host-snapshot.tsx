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
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { composeStories } from '@storybook/react-vite';
import { StoryTestWrapper } from '../../../../../../.storybook/test-wrapper';
import * as stories from './checkout-store-selection-host.stories';

const composed = composeStories(stories);
afterEach(cleanup);
describe('checkout-store-selection-host stories snapshot', () => {
    for (const [name, Story] of Object.entries(composed)) {
        if (Story.parameters.snapshot === false) continue;
        test(`${name} renders and matches snapshot`, async () => {
            const { container } = render(<StoryTestWrapper><Story /></StoryTestWrapper>);
            if (name === 'Playground') {
                await waitFor(() => expect(container.querySelector('p.sr-only[aria-live="polite"]')).toBeInTheDocument());
            }
            expect(container).toMatchSnapshot();
        });
    }
});
