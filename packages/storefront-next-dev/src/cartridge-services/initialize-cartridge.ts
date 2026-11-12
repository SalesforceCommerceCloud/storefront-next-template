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
import fs from 'fs-extra';
import path from 'path';
import { createScaffoldRegistry, generateFromScaffold } from '@salesforce/b2c-tooling-sdk/scaffold';
import { assertValidCartridgeName, CARTRIDGES_BASE_DIR } from '../config';

/**
 * Create a named cartridge with only SDK identity files (`.project` and
 * `<name>.properties`). Sample controllers, models, scripts, templates, and
 * static assets are omitted. If the target already exists, leave it unchanged
 * so non-metadata customizations are preserved. No project base cartridge is
 * required.
 */
export async function initializeNamedCartridge(projectDirectory: string, cartridgeName: string): Promise<void> {
    assertValidCartridgeName(cartridgeName);

    const cartridgesDir = path.join(projectDirectory, CARTRIDGES_BASE_DIR);
    const targetDir = path.join(cartridgesDir, cartridgeName);

    if (fs.existsSync(targetDir)) {
        return;
    }

    const registry = createScaffoldRegistry();
    const scaffold = await registry.getScaffold('cartridge', { sources: ['built-in'] });
    if (!scaffold) {
        throw new Error('Built-in cartridge scaffold not found');
    }

    await generateFromScaffold(scaffold, {
        outputDir: cartridgesDir,
        interactive: false,
        variables: {
            cartridgeName,
            includeControllers: false,
            includeModels: false,
            includeScripts: false,
            includeTemplates: false,
            includeStatic: false,
        },
    });
}
