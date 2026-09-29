//#region src/utils/logger.d.ts

/**
 * Centralized, level-gated logger for the SDK.
 *
 * Log level is controlled by `SFCC_LOG_LEVEL` env var (`error` | `warn` | `info` | `debug`),
 * or on Managed Runtime by the numeric `MRT_LOG_LEVEL` (see {@link MRT_NUMERIC_TO_LEVEL}).
 * Falls back to: `DEBUG` targeting sfnext -> `debug`, `NODE_ENV=production` -> `warn`, otherwise `info`.
 */
type LogLevel = 'error' | 'warn' | 'info' | 'debug';
declare const logger: {
  error(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  setLevel(level: LogLevel | undefined): void;
  getLevel(): LogLevel;
};
//#endregion
export { type LogLevel, logger };
//# sourceMappingURL=index.d.ts.map