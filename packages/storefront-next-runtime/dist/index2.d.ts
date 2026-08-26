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
  bytes: number;
  estimatedBrotliBytes: number;
  estimatedGzipBytes: number;
}
interface PageDesignerPreloadManifestComponentResources {
  styles?: number[];
  entries?: number[];
  dependencies?: number[];
}
interface PageDesignerPreloadManifest {
  version: 1;
  compression: {
    brotli: {
      quality: number;
    };
    gzip: {
      level: number;
    };
  };
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
type CompressedSizeStrategy = 'brotli' | 'gzip' | 'max';
type PreloadWarning = {
  code: 'unknown-type-ids';
  typeIds: string[];
} | {
  code: 'module-budget-exceeded';
  selectedModuleEstimatedTransferBytes: number;
  selectedModuleRawBytes: number;
  omittedModules: Array<{
    file: string;
    estimatedTransferBytes: number;
    rawBytes: number;
  }>;
} | {
  code: 'resource-count';
  selectedResources: number;
  warnAtResources: number;
};
interface ResolvePreloadResourcesOptions {
  bundlePath: string;
  /** Maximum estimated transfer bytes spent on optional module hints; required styles are excluded. */
  maxModuleEstimatedTransferBytes?: number;
  /** Maximum raw bytes spent on optional module hints; required styles are excluded. */
  maxModuleRawBytes?: number;
  compressedSizeStrategy?: CompressedSizeStrategy;
  warnAtResources?: number;
  onWarning?: (warning: PreloadWarning) => void;
}
declare function dedupePreloadResources(resources: PreloadResource[]): PreloadResource[];
declare function resolvePreloadResources(manifest: PageDesignerPreloadManifest, typeIds: Iterable<string>, options: ResolvePreloadResourcesOptions): PreloadResource[];
//#endregion
export { PreloadResource as a, dedupePreloadResources as c, PageDesignerPreloadManifestResource as i, resolvePreloadResources as l, PageDesignerPreloadManifest as n, PreloadWarning as o, PageDesignerPreloadManifestComponentResources as r, ResolvePreloadResourcesOptions as s, CompressedSizeStrategy as t };
//# sourceMappingURL=index2.d.ts.map