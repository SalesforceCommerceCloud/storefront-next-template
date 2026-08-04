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

import type { Plugin, ResolvedConfig } from 'vite';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';
import { loadEngagementConfig, type EngagementConfig } from './configLoader';
import { logger } from '../logger';

/**
 * Configuration options for the event instrumentation validator plugin
 */
export interface EventInstrumentationValidatorConfig {
    /**
     * Path to config module relative to project root
     * @default 'config.server.ts'
     */
    configPath?: string;

    /**
     * Directories to scan for trackEvent calls relative to project root
     * @default ['src']
     */
    scanPaths?: string[];

    /**
     * Whether to fail the build on missing instrumentation
     * @default false (warning only)
     */
    failOnMissing?: boolean;
}

/**
 * Extract all trackEvent calls from source files and return the event types found
 */
async function scanForInstrumentedEvents(projectRoot: string, scanPaths: string[]): Promise<Set<string>> {
    const instrumentedEvents = new Set<string>();

    // Regex patterns to match trackEvent calls
    // Pattern 1: trackEvent(...leading args..., 'event_type', ...)
    // The event type is the first string-literal argument, which sits after the
    // leading non-string args (auth, config, consent, and — in the current hook —
    // siteInfo). Matching "≥3 non-string args then a string literal" tolerates both
    // the older 4-arg call shape and the current 5-arg one (siteInfo added).
    //
    // SOURCE OF TRUTH: the `trackEvent` helper in the template's `src/hooks/use-analytics.ts`.
    // If that signature changes (a leading positional arg added/removed, or `eventType` passed
    // as a non-literal), this regex must change with it — a mismatch makes the scan find zero
    // events and emit false "never instrumented" warnings. A matching guard comment lives above
    // that helper's definition.
    const trackEventPattern = /trackEvent\s*\(\s*(?:[^,'"]+,\s*){3,}['"]([^'"]+)['"]/g;

    // Pattern 2: sendViewPageEvent (special case for view_page)
    const sendViewPagePattern = /sendViewPageEvent\s*\(/g;

    // Pattern 3: createEvent('event_type', ...) - backup pattern
    const createEventPattern = /createEvent\s*\(\s*['"]([^'"]+)['"]/g;

    for (const scanPath of scanPaths) {
        const absoluteScanPath = resolve(projectRoot, scanPath);
        const pattern = join(absoluteScanPath, '**/*.{ts,tsx}');

        const files = await glob(pattern, {
            ignore: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/node_modules/**'],
        });

        logger.debug(`📂 Scanning ${files.length} files in ${scanPath}...`);

        for (const file of files) {
            try {
                const content = readFileSync(file, 'utf-8');

                // Find trackEvent calls
                let match;
                while ((match = trackEventPattern.exec(content)) !== null) {
                    const eventType = match[1];
                    instrumentedEvents.add(eventType);
                    logger.debug(`  ✓ Found trackEvent('${eventType}') in ${file}`);
                }

                // Check for sendViewPageEvent (implies view_page is instrumented)
                if (sendViewPagePattern.test(content)) {
                    instrumentedEvents.add('view_page');
                    logger.debug(`  ✓ Found sendViewPageEvent() in ${file}`);
                }

                // Find createEvent calls as backup
                while ((match = createEventPattern.exec(content)) !== null) {
                    const eventType = match[1];
                    instrumentedEvents.add(eventType);
                    logger.debug(`  ✓ Found createEvent('${eventType}') in ${file}`);
                }

                // Reset regex lastIndex for next file
                trackEventPattern.lastIndex = 0;
                sendViewPagePattern.lastIndex = 0;
                createEventPattern.lastIndex = 0;
            } catch (error) {
                logger.warn(`⚠️  Could not read ${file}: ${(error as Error).message}`);
            }
        }
    }

    return instrumentedEvents;
}

/**
 * Extract enabled event toggles per adapter
 * Dynamically iterates over all keys in eventToggles - supports custom event types
 */
function extractEnabledEvents(engagement: EngagementConfig): Map<string, Set<string>> {
    const adapterEvents = new Map<string, Set<string>>();

    if (!engagement.adapters) {
        return adapterEvents;
    }

    for (const [adapterName, adapterConfig] of Object.entries(engagement.adapters)) {
        // Skip disabled adapters
        if (!adapterConfig.enabled) {
            continue;
        }

        const enabledEvents = new Set<string>();

        if (adapterConfig.eventToggles) {
            // Dynamically iterate over all keys in eventToggles
            for (const [eventType, isEnabled] of Object.entries(adapterConfig.eventToggles)) {
                if (isEnabled === true) {
                    enabledEvents.add(eventType);
                }
            }
        }

        if (enabledEvents.size > 0) {
            adapterEvents.set(adapterName, enabledEvents);
        }
    }

    return adapterEvents;
}

/**
 * Vite plugin that validates event instrumentation at build time.
 *
 * This plugin scans source files for trackEvent() calls and validates that
 * all enabled event toggles in config.server.ts have corresponding instrumentation.
 *
 * @param config - Configuration options for the plugin
 * @returns A Vite plugin that validates event instrumentation
 *
 * @example
 * // In vite.config.ts
 * export default defineConfig({
 *   plugins: [
 *     eventInstrumentationValidatorPlugin({
 *       configPath: 'config.server.ts',
 *       scanPaths: ['src'],
 *       verbose: true
 *     })
 *   ]
 * })
 */
export const eventInstrumentationValidatorPlugin = (config: EventInstrumentationValidatorConfig = {}): Plugin => {
    const { configPath = 'config.server.ts', scanPaths = ['src'], failOnMissing = false } = config;

    let resolvedConfig: ResolvedConfig;

    return {
        name: 'storefrontnext:event-instrumentation-validator',
        apply: 'build',

        configResolved(viteConfig) {
            resolvedConfig = viteConfig;
        },

        async buildStart() {
            const projectRoot = resolvedConfig.root;

            logger.debug('🔍 Validating event instrumentation...');

            // Load engagement config
            const engagement = await loadEngagementConfig(projectRoot, configPath);

            if (!engagement) {
                logger.debug('ℹ️  Skipping validation - no engagement config found');
                return;
            }

            // Extract enabled events per adapter
            const adapterEvents = extractEnabledEvents(engagement);

            if (adapterEvents.size === 0) {
                logger.debug('ℹ️  No enabled adapters with event toggles found');
                return;
            }

            // Scan source files for instrumented events
            const instrumentedEvents = await scanForInstrumentedEvents(projectRoot, scanPaths);

            logger.debug(
                `🔎 Found ${instrumentedEvents.size} instrumented event types: ${[...instrumentedEvents].join(', ')}`
            );

            // Validate each adapter's enabled events
            const missingInstrumentation: Array<{ adapter: string; event: string }> = [];

            for (const [adapterName, enabledEvents] of adapterEvents) {
                for (const eventType of enabledEvents) {
                    if (!instrumentedEvents.has(eventType)) {
                        missingInstrumentation.push({
                            adapter: adapterName,
                            event: eventType,
                        });
                    }
                }
            }

            // Report results
            if (missingInstrumentation.length === 0) {
                logger.debug('✅ All enabled events are instrumented');
                return;
            }

            // Report missing instrumentation
            for (const { adapter, event } of missingInstrumentation) {
                logger.warn(`⚠️  ${adapter}.${event} is enabled but '${event}' is never instrumented`);
            }

            if (failOnMissing) {
                throw new Error(
                    `[event-instrumentation] ${missingInstrumentation.length} event(s) are enabled but not instrumented. ` +
                        `Either add instrumentation or disable the event toggles in config.server.ts.`
                );
            }
        },
    };
};
