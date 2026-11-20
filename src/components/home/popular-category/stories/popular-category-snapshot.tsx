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
import { composeStories } from '@storybook/react-vite';
import { cleanup, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, test } from 'vitest';
import { AllProvidersWrapper } from '@/test-utils/context-provider';
import * as stories from './index.stories';

const composed = composeStories(stories);
afterEach(cleanup);

describe('PopularCategory stories snapshot', () => {
    for (const [name, Story] of Object.entries(composed)) {
        if (Story.parameters.snapshot === false) continue;
        test(`${name} story renders and matches snapshot`, () => {
            const router = createMemoryRouter([
                {
                    path: '*',
                    element: (
                        <AllProvidersWrapper>
                            <Story />
                        </AllProvidersWrapper>
                    ),
                },
            ]);
            const { container } = render(<RouterProvider router={router} />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
