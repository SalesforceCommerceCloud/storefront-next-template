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

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ImageNavArrowsProps {
    currentIndex: number;
    imageCount: number;
    onIndexChange: (index: number) => void;
    /** Arrow button size: "sm" for PLP/cart, "lg" for PDP */
    size?: 'sm' | 'lg';
    className?: string;
}

export default function ImageNavArrows({
    currentIndex,
    imageCount,
    onIndexChange,
    size = 'sm',
    className,
}: ImageNavArrowsProps) {
    const { t } = useTranslation('common');

    const goPrev = () => onIndexChange(currentIndex <= 0 ? imageCount - 1 : currentIndex - 1);
    const goNext = () => onIndexChange(currentIndex >= imageCount - 1 ? 0 : currentIndex + 1);

    const isLarge = size === 'lg';

    return (
        <>
            <button
                type="button"
                onClick={goPrev}
                className={cn(
                    'absolute top-1/2 -translate-y-1/2 cursor-pointer',
                    'rounded-ui bg-background/90 hover:bg-background transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isLarge ? 'left-4 p-3 shadow-lg' : 'left-2 p-1.5 shadow-md',
                    className
                )}
                aria-label={t('previousImage')}>
                <ChevronLeft className={isLarge ? 'size-6' : 'size-4'} />
            </button>
            <button
                type="button"
                onClick={goNext}
                className={cn(
                    'absolute top-1/2 -translate-y-1/2 cursor-pointer',
                    'rounded-ui bg-background/90 hover:bg-background transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isLarge ? 'right-4 p-3 shadow-lg' : 'right-2 p-1.5 shadow-md',
                    className
                )}
                aria-label={t('nextImage')}>
                <ChevronRight className={isLarge ? 'size-6' : 'size-4'} />
            </button>
        </>
    );
}
