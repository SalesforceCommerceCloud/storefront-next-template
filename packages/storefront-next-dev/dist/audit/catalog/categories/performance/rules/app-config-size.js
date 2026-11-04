import "../../../../../har.js";
import { i as kib, n as documentSizeDataSchema, r as documentSizeRule } from "../../../../../document-size.js";

//#region src/audit/catalog/categories/performance/rules/app-config-size.ts
var app_config_size_default = documentSizeRule({
	label: "App config",
	budget: 12 * 1024,
	value: (size) => size.appConfigBytes,
	format: kib,
	evidence: (size) => size.scripts.appConfig[0] ? { artifact: size.scripts.appConfig[0] } : null,
	decideFailures: false
});

//#endregion
export { documentSizeDataSchema as dataSchema, app_config_size_default as default };