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
export { type PageProcessorContext, processPage } from './page/process-page';
export {
    type PageVisitor,
    type VisitorContext,
    transformPage,
    transformComponent,
    transformRegion,
} from './page/transform';
export { RequiredError } from './errors/required';
export { resolvePage, type ResolvePageOptions } from './page/resolve-page';
export { validateRule } from './validate-rule';
export type { AttributeResolutionContext, AttributeResolutionWarning } from './page/attribute-resolution';
export type {
    Manifest,
    PageManifest,
    ComponentManifest,
    ComponentInfoEntry,
    SiteManifest,
    ManifestStorage,
    ContextResolver,
    IdentifierType,
    QualifierContext,
    VisibilityRuleDef,
    VisitorContextType,
    InferNodeFromType,
    ResolvedDataBinding,
} from './types';
