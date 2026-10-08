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
import { useSite } from '@salesforce/storefront-next-runtime/site-context';
import { useConfig } from '@salesforce/storefront-next-runtime/config';

/**
 * Returns the current site and locale identifiers for URL building.
 * Applies alias mappings when configured, falling back to the raw IDs.
 */
export function useCurrentSiteAndLocaleRef() {
    const { site, locale } = useSite();
    const config = useConfig();

    return {
        siteRef: site.alias ?? site.id,
        localeRef: config.localeAliasMap?.[locale.id] ?? locale.id,
    };
}
