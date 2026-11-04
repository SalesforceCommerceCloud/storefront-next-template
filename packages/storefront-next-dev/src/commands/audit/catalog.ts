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
import { defaultCategoriesDir, discoverCatalog } from '../../audit/catalog';
import { AuditCommand } from '../../audit/command';
import { text } from '../../audit/flags';
import { commonFlags } from '../../flags';

export default class Catalog extends AuditCommand {
    static override hidden = true;
    static override summary = 'Inspect the discovered category and rule catalog';
    static override examples = ['<%= config.bin %> <%= command.id %>'];
    static override flags = {
        // Accepted so every audit verb takes the same project flag; the catalog ships with this package.
        ...commonFlags,
        categories: text({ helpValue: '<dir>', description: 'Read another categories directory' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(Catalog);
        this.log(JSON.stringify(await discoverCatalog(flags.categories ?? defaultCategoriesDir()), null, 2));
    }
}
