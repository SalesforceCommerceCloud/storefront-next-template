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
import { expect, test, describe, afterEach, vi } from 'vitest';
import { composeStories } from '@storybook/react-vite';
import { mockConfig } from '@/test-utils/config';

vi.mock('@salesforce/storefront-next-runtime/config', () => ({
    useConfig: () => mockConfig,
}));
// oxlint-disable-next-line import/no-namespace
import * as CollapsibleHtmlSectionStories from './collapsible-html-section.stories';
import { render, cleanup } from '@testing-library/react';

const composed = composeStories(CollapsibleHtmlSectionStories);

afterEach(() => {
    cleanup();
});

describe('CollapsibleHtmlSection stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
