//#region src/cartridge-services/generate-cartridge.d.ts

/**
 * Options for generateMetadata function
 */
interface GenerateMetadataOptions {
  /**
   * Optional array of specific file paths to process.
   * If provided, only these files will be processed and existing cartridge files will NOT be deleted.
   * If omitted, the entire src/ directory will be scanned and all existing cartridge files will be deleted first.
   */
  filePaths?: string[];
  /**
   * Whether to format generated JSON files with Biome so they match the project's formatting.
   * Defaults to true.
   */
  lintFix?: boolean;
  /**
   * If true, scans files and reports what would be generated without actually writing any files or deleting directories.
   * Defaults to false.
   */
  dryRun?: boolean;
}
/**
 * Result returned by generateMetadata function
 */
interface GenerateMetadataResult {
  componentsGenerated: number;
  pageTypesGenerated: number;
  aspectsGenerated: number;
  totalFiles: number;
}
declare function generateMetadata(projectDirectory: string, metadataDirectory: string, options?: GenerateMetadataOptions): Promise<GenerateMetadataResult>;
//#endregion
export { type GenerateMetadataOptions, type GenerateMetadataResult, generateMetadata };
//# sourceMappingURL=index.d.ts.map