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
import type { ReactElement } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Typography } from '@/components/typography';

interface ListSkeletonProps {
    statusMessage: string | null;
}

export default function ListSkeleton({ statusMessage }: ListSkeletonProps): ReactElement {
    const rows = Array.from({ length: 10 }, (_, i) => i);
    return (
        <div className="mt-4">
            {statusMessage && (
                <div className="mb-4" role="status" aria-live="polite">
                    <Typography variant="large" as="div" className="flex justify-center items-center text-center">
                        {statusMessage}
                    </Typography>
                    <Separator className="mt-4" />
                </div>
            )}
            <ul aria-label="loading store results">
                {rows.map((idx) => (
                    <li key={idx} className="py-3">
                        <div className="flex items-start gap-3">
                            <Skeleton className="mt-1 h-4 w-4 rounded-full" />
                            <div className="w-full grid grid-cols-2 md:grid-cols-[260px_1fr_auto] gap-2">
                                <div className="col-span-1">
                                    <Skeleton className="h-6 w-56 max-w-full" />
                                </div>
                                <div className="col-span-2 md:col-span-1 md:col-start-2">
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-40 max-w-full" />
                                        <Skeleton className="h-4 w-64 max-w-full" />
                                    </div>
                                </div>
                                <div className="col-span-2 md:col-span-1 md:col-start-1 md:mt-2">
                                    <Skeleton className="h-4 w-28 max-w-full" />
                                </div>
                                <div className="col-span-2 md:col-span-2 md:col-start-2">
                                    <div className="flex items-center justify-between">
                                        <Skeleton className="h-5 w-28" />
                                        <Skeleton className="h-5 w-5 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        {idx < rows.length - 1 && <Separator className="my-3" />}
                    </li>
                ))}
            </ul>
        </div>
    );
}
