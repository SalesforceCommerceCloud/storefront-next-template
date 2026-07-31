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
import type { AppConfig } from '@/types/config';
import { createEinsteinAdapter } from './einstein';
import { addAdapter } from './store';
import { createActiveDataAdapter } from './active-data';
import { createData360Adapter } from './data360';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

/**
 * Initialize engagement adapters.
 *
 * Uses properties defined in appConfig.engagement.adapters to set up default adapters.
 *
 * This is the place to modify when adding new engagement adapters to the system.
 */
export function initializeEngagementAdapters(appConfig: AppConfig): void {
    const engagementAdapterConfigs = appConfig?.engagement?.adapters;

    // Register default adapters
    // Comment these out to disable the default adapters
    if (engagementAdapterConfigs?.einstein?.enabled) {
        try {
            addAdapter(
                'einstein',
                createEinsteinAdapter({
                    host: engagementAdapterConfigs.einstein.host || '',
                    einsteinId: engagementAdapterConfigs.einstein.einsteinId || '',
                    realm: engagementAdapterConfigs.einstein.realm || '',
                    siteId: engagementAdapterConfigs.einstein.siteId || '',
                    isProduction: engagementAdapterConfigs.einstein.isProduction || false,
                    consentCategory: engagementAdapterConfigs.einstein.consentCategory,
                    eventToggles: engagementAdapterConfigs.einstein.eventToggles || {},
                })
            );
        } catch (error) {
            logger.warn('Failed to initialize Einstein adapter', { error });
        }
    }

    if (engagementAdapterConfigs.data360?.enabled) {
        try {
            addAdapter(
                'data360',
                createData360Adapter({
                    appSourceId: engagementAdapterConfigs.data360.appSourceId || '',
                    tenantId: engagementAdapterConfigs.data360.tenantId || '',
                    siteId: engagementAdapterConfigs.data360.siteId || '',
                    webStoreId: engagementAdapterConfigs.data360.webStoreId || 'sfnext',
                    consentCategory: engagementAdapterConfigs.data360.consentCategory,
                    eventToggles: engagementAdapterConfigs.data360.eventToggles || {},
                })
            );
        } catch (error) {
            logger.warn('Failed to initialize Data 360 adapter', { error });
        }
    }

    if (engagementAdapterConfigs.activeData.enabled) {
        try {
            addAdapter(
                'active-data',
                createActiveDataAdapter({
                    host: engagementAdapterConfigs.activeData.host || '',
                    siteUUID: engagementAdapterConfigs.activeData.siteUUID || '',
                    consentCategory: engagementAdapterConfigs.activeData.consentCategory,
                    eventToggles: engagementAdapterConfigs.activeData.eventToggles || {},
                })
            );
        } catch (error) {
            logger.warn('Failed to initialize Active Data adapter', { error });
        }
    }
}
