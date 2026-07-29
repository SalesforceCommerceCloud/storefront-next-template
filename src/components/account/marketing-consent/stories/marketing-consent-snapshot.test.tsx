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
import { vi, expect, test, describe, afterEach } from 'vitest';
import { composeStories } from '@storybook/react-vite';
// oxlint-disable-next-line import/no-namespace
import * as MarketingConsentStories from './index.stories';
import { render, cleanup } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ConfigWrapper } from '@/test-utils/config';

vi.mock('@/hooks/use-scapi-fetcher', () => ({
    useScapiFetcher: vi.fn(() => ({ data: null, load: vi.fn() })),
}));

const composed = composeStories(MarketingConsentStories);

afterEach(() => {
    cleanup();
});

describe('MarketingConsent stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        if (Story?.parameters?.snapshot === false) continue;
        test(`${storyName} story renders and matches snapshot`, () => {
            const router = createMemoryRouter(
                [
                    {
                        path: '/',
                        element: (
                            <ConfigWrapper>
                                <Story />
                            </ConfigWrapper>
                        ),
                    },
                ],
                { initialEntries: ['/'] }
            );
            const { container } = render(<RouterProvider router={router} />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
