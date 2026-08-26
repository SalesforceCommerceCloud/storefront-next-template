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
import { type ReactElement, useMemo, useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import type { InfoModalData } from '@/components/info-modal/types';
import type { ReturnsAndWarrantyData } from '@/extensions/product-content/lib/api/product-content.server';
import ProductInfoCard from '@/components/product-info-card';

const InfoModal = lazy(() => import('@/components/info-modal'));

export interface ReturnsAndWarrantyProps {
    /** Returns & warranty data resolved from the route loader. */
    data: ReturnsAndWarrantyData;
}

/**
 * @feature-stub Returns & Warranty
 * @status stub — no backend integration
 *
 * Renders the returns & warranty info card on PDP and a "Learn More" modal with the
 * full policy text. Data is supplied as a prop from the route loader; this
 * component is presentational only. Backed by `lib/api/product-content.server.ts`
 * (mock by default).
 */
export default function ReturnsAndWarranty({ data }: ReturnsAndWarrantyProps): ReactElement {
    const { t } = useTranslation('extProductContent');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const modalData = useMemo<InfoModalData>(
        () => ({
            type: 'returns-and-warranty',
            title: data.title,
            returnsAndWarrantyData: data,
        }),
        [data]
    );

    return (
        <>
            <div className="mt-4">
                <ProductInfoCard
                    icon={<ShieldCheck className="h-5 w-5" />}
                    title={data.title}
                    titleAs="h2"
                    description={data.description}
                    action={{
                        label: t('returnsAndWarranty.learnMore'),
                        onClick: () => setIsModalOpen(true),
                    }}
                />
            </div>
            {isModalOpen && (
                <Suspense fallback={null}>
                    <InfoModal open={isModalOpen} onOpenChange={setIsModalOpen} data={modalData} />
                </Suspense>
            )}
        </>
    );
}
