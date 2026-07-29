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

import * as CategoryPaginationStories from './index.stories';
import { render, cleanup } from '@testing-library/react';
import { StoryTestWrapper } from '../../../../.storybook/test-wrapper';

const composed = composeStories(CategoryPaginationStories);

afterEach(() => {
    cleanup();
});

describe('CategoryPagination stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed)) {
        test(`${storyName} story renders and matches snapshot`, () => {
            // CategoryPagination reads useConfig()/useCurrentSiteAndLocaleRef()
            // (via the site-context-aware useNavigate) plus useLocation, so it
            // needs the full provider stack, not a bare router — StoryTestWrapper
            // supplies ConfigProvider + SiteProvider + a memory router.
            const { container } = render(
                <StoryTestWrapper>
                    <Story />
                </StoryTestWrapper>
            );
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
