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
import { Suspense, lazy } from 'react';
import { Await } from 'react-router';
import { useTranslation } from 'react-i18next';
import CollapsibleSection from '@/components/collapsible-section';
import { resolvePdpSections, type PdpSection } from '@/extensions/product-content/lib/pdp-sections';
import { useProductContentData } from '@/extensions/product-content/context/product-content-data-context';
import type { SectionContent } from '@/components/html-fragment/types';

const ProductAdapterSection = lazy(() => import('@/extensions/product-content/components/product-adapter-section'));

export default function PdpCollapsiblesTarget() {
    const ctx = useProductContentData();
    const collapsiblesPromise = ctx?.pdpCollapsiblesPromise;
    const product = ctx?.product;

    if (!collapsiblesPromise || !product) return null;

    const sections = resolvePdpSections(product);
    if (sections.length === 0) return null;

    return (
        <div className="mt-4">
            <Suspense fallback={<CollapsibleSectionShells sections={sections} />}>
                <Await resolve={collapsiblesPromise} errorElement={null}>
                    {(contents) => <ResolvedCollapsibles sections={sections} contents={contents} />}
                </Await>
            </Suspense>
        </div>
    );
}

function CollapsibleSectionShells({ sections }: { sections: PdpSection[] }) {
    const { t } = useTranslation('product');
    return (
        <>
            {sections.map((section) => (
                <CollapsibleSection key={section.labelKey} label={t(section.labelKey)}>
                    <ProductAdapterSection content={null} />
                </CollapsibleSection>
            ))}
        </>
    );
}

function ResolvedCollapsibles({
    sections,
    contents,
}: {
    sections: PdpSection[];
    contents: Array<SectionContent | null>;
}) {
    const { t } = useTranslation('product');
    return (
        <>
            {sections.map((section, index) => (
                <CollapsibleSection key={section.labelKey} label={t(section.labelKey)}>
                    <ProductAdapterSection content={contents[index] ?? null} />
                </CollapsibleSection>
            ))}
        </>
    );
}
