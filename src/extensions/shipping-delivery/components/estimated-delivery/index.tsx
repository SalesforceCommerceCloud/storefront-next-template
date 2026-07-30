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
/** @sfdc-extension-file SFDC_EXT_SHIPPING_DELIVERY */
import { type ReactElement, useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import type { InfoModalData } from '@/components/info-modal/types';
import type { EstimatedDeliveryData } from '@/extensions/shipping-delivery/lib/api/shipping-delivery.server';
import ProductInfoCard from '@/components/product-info-card';

const InfoModal = lazy(() => import('@/components/info-modal'));

function mapToInfoModalData(data: EstimatedDeliveryData): InfoModalData {
    return {
        type: 'estimated-delivery',
        title: data.title,
        deliveryData: data,
    };
}

export interface EstimatedDeliveryProps {
    data: EstimatedDeliveryData;
}

export default function EstimatedDelivery({ data }: EstimatedDeliveryProps): ReactElement {
    const { t } = useTranslation('estimatedDelivery');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const modalData = mapToInfoModalData(data);

    const firstOption = data.estimatedDelivery.options[0];
    const cardDescription = firstOption
        ? `${firstOption.deliveryTime} · ${t('cardDescription')}`
        : t('cardDescription');

    return (
        <>
            <div className="mt-4">
                <ProductInfoCard
                    icon={<CalendarDays className="h-5 w-5" />}
                    title={t('cardTitle')}
                    titleAs="h2"
                    description={cardDescription}
                    action={{
                        label: t('learnMore'),
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
