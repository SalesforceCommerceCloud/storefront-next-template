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
import { expect, test, describe, afterEach } from 'vitest';
import { composeStories } from '@storybook/react-vite';
import * as ProductZoomModalStories from './index.stories';
import { render, cleanup, waitFor } from '@testing-library/react';

const composed = composeStories(ProductZoomModalStories);

afterEach(() => {
    cleanup();
});

describe('ProductZoomModal stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, async () => {
            render(<Story />);
            // The Dialog content is portaled to document.body (and mounts a tick after render), so wait
            // for the dialog then snapshot its content rather than the empty render container.
            const content = await waitFor(() => {
                const node = document.body.querySelector('[data-slot="product-zoom-modal"]');
                if (!node) {
                    throw new Error('dialog content not yet mounted');
                }
                return node;
            });
            expect(content).toMatchSnapshot();
        });
    }
});
