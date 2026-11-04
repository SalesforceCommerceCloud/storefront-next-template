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
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditResultJsonSchema } from './results';

const dir = path.resolve(import.meta.dirname, '../../dist/audit/schemas');
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'audit-result.schema.json'), `${JSON.stringify(auditResultJsonSchema(), null, 2)}\n`);
