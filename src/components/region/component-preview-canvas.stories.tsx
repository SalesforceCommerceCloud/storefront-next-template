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
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { waitForStorybookReady } from '@storybook/test-utils';
import { Region } from '@/components/region';
import { registry } from '@/lib/page-designer/registry';
import { PREVIEW_PAGE_ID, PREVIEW_REGION_ID } from '@/lib/page-designer/preview-page';
import type { PageWithComponentData } from '@/lib/page-designer/page-loader.server';
import type { ShopperExperience } from '@/scapi';

/**
 * Renders the mini-PD component-preview canvas: a single Page Designer component
 * hosted in a synthesized "preview" page (the shape the `_empty.preview.component`
 * route's loader produces via `injectIntoPreviewRegion`), rendered through the real
 * `<Region page regionId="preview">` path inside a chrome-free `<main>`.
 */

const PREVIEW_TYPE_ID = 'Story.previewBlock';

// A minimal real component so the registry resolves it synchronously (no Suspense
// on preload) and the genuine <Region>/<Component> render path runs in the story.
function PreviewBlock({ data }: { data?: { headline?: string } }) {
    return (
        <section data-testid="preview-block">
            <h2>{data?.headline ?? 'Previewed content block'}</h2>
        </section>
    );
}

registry.registerComponent(PREVIEW_TYPE_ID, PreviewBlock as never);

// The synthesized preview page: one `preview` region holding the previewed component,
// with the component's own loader data carried on the page-level componentData map.
const previewPage: PageWithComponentData = {
    id: PREVIEW_PAGE_ID,
    regions: [
        {
            id: PREVIEW_REGION_ID,
            components: [{ id: 'preview-comp-1', typeId: PREVIEW_TYPE_ID }],
        },
    ] as unknown as ShopperExperience.schemas['Region'][],
    componentData: { 'preview-comp-1': Promise.resolve({ headline: 'Previewed content block' }) },
} as unknown as PageWithComponentData;

function PreviewCanvas() {
    return (
        <main>
            <Region page={previewPage} regionId={PREVIEW_REGION_ID} />
        </main>
    );
}

const meta: Meta<typeof PreviewCanvas> = {
    title: 'PAGE DESIGNER/Component Preview Canvas',
    component: PreviewCanvas,
    tags: ['interaction'],
    parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await waitForStorybookReady(canvasElement);

        // The previewed block renders inside the preview region.
        await expect(await canvas.findByTestId('preview-block')).toBeInTheDocument();
        await expect(await canvas.findByRole('heading', { name: /previewed content block/i })).toBeInTheDocument();
    },
};
