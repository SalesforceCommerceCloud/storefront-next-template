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
import { count, documentSizeRule } from '../../../../rule-helpers/document-size';

export { documentSizeDataSchema as dataSchema } from '../../../../rule-helpers/document-size';
export default documentSizeRule({
    label: 'Element count',
    budget: 1400,
    value: (size) => size.elements,
    format: count,
    evidence: (size) =>
        size.lighthouseArtifact
            ? { artifact: size.lighthouseArtifact, pointer: '/audits/dom-size-insight/details/items' }
            : null,
    decideFailures: false,
});
