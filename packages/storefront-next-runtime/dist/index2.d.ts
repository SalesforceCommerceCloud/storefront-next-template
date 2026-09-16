//#region src/design/preload/index.d.ts
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
interface PageDesignerPreloadManifestResource {
  file: string;
  kind: 'module' | 'style';
}
interface PageDesignerPreloadManifestComponentResources {
  styles?: number[];
  entries?: number[];
  dependencies?: number[];
}
interface PageDesignerPreloadManifest {
  resources: PageDesignerPreloadManifestResource[];
  components: Record<string, PageDesignerPreloadManifestComponentResources>;
}
type PreloadResource = {
  kind: 'module';
  href: string;
} | {
  kind: 'style';
  href: string;
};
type PreloadWarning = {
  code: 'unknown-type-ids';
  typeIds: string[];
} | {
  code: 'resource-count';
  selectedResources: number;
  warnAtResources: number;
};
interface ResolvePreloadResourcesOptions {
  bundlePath: string;
  warnAtResources?: number;
  onWarning?: (warning: PreloadWarning) => void;
}
declare function dedupePreloadResources(resources: PreloadResource[]): PreloadResource[];
declare function resolvePreloadResources(manifest: PageDesignerPreloadManifest, typeIds: Iterable<string>, options: ResolvePreloadResourcesOptions): PreloadResource[];
//#endregion
export { PreloadWarning as a, resolvePreloadResources as c, PreloadResource as i, PageDesignerPreloadManifestComponentResources as n, ResolvePreloadResourcesOptions as o, PageDesignerPreloadManifestResource as r, dedupePreloadResources as s, PageDesignerPreloadManifest as t };
//# sourceMappingURL=index2.d.ts.map