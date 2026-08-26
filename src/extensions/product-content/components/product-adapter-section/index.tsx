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
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { SectionContent } from '@/components/html-fragment/types';
import HtmlFragment from '@/components/html-fragment';
import SpecTable from '@/components/spec-table';

export interface ProductAdapterSectionProps {
    /** Pre-resolved content for this section (legacy HTML or a structured spec table), or `null`. */
    content: SectionContent | null;
}

/**
 * Body for an adapter-backed collapsible section on the PDP.
 *
 * Receives content as a prop from the route loader; the parent route resolves
 * the section's data via `getXxx` from `lib/api/product-content.server.ts` and
 * streams it through `<Suspense>`/`<Await>`. When `content` is `null` (no
 * content available), renders a localized "coming soon" fallback.
 *
 * Intended to be rendered as the child of a CollapsibleSection shell.
 */
export default function ProductAdapterSection({ content }: ProductAdapterSectionProps): ReactElement {
    const { t } = useTranslation('extProductContent');

    if (!content) {
        return <p className="text-sm text-muted-foreground">{t('contentComingSoon')}</p>;
    }

    if (content.contentType === 'spec-table') {
        return <SpecTable content={content} />;
    }

    return <HtmlFragment content={content.html} contentType={content.contentType} />;
}
