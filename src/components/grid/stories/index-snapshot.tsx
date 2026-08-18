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
import type { ComponentType } from 'react';
import { expect, test, describe, afterEach } from 'vitest';

import { composeStories } from '@storybook/react-vite';

import * as GridStories from './index.stories';
import { render, cleanup } from '@testing-library/react';

const composed = composeStories(GridStories);

afterEach(() => {
    cleanup();
});

type ComposedStory = ComponentType & { parameters?: { snapshot?: boolean } };

describe('Grid stories snapshot', () => {
    for (const [storyName, Story] of Object.entries(composed) as [string, ComposedStory][]) {
        // Interaction-only stories opt out of snapshotting. The design-mode empty state renders
        // its children inside a lazy Suspense provider that resolves in a live browser but suspends
        // to a fallback in this synchronous render — so its DOM is not deterministically snapshottable.
        if (Story?.parameters?.snapshot === false) continue;
        test(`${storyName} story renders and matches snapshot`, () => {
            const { container } = render(<Story />);
            expect(container.firstChild).toMatchSnapshot();
        });
    }
});
