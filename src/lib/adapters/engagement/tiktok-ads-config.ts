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

import type { EngagementAdapterConfig } from './types';

export type TikTokAdsClientConfig = EngagementAdapterConfig & {
    pixelId: string;
};

export const TIKTOK_ADS_ADAPTER_NAME = 'tiktokAds' as const;

function isNonBlankString(value: unknown): boolean {
    return typeof value === 'string' && value.trim() !== '';
}

export function validateTikTokAdsConfig(config: Partial<TikTokAdsClientConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!isNonBlankString(config.pixelId)) {
        errors.push('Missing required field: pixelId');
    }
    return { valid: errors.length === 0, errors };
}
