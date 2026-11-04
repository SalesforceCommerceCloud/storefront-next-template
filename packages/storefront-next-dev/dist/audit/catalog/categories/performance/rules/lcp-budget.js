import "../../../../../measured-run.js";
import { n as metricBudget, r as milliseconds, t as dataSchema } from "../../../../../metric-budget.js";

//#region src/audit/catalog/categories/performance/rules/lcp-budget.ts
var lcp_budget_default = metricBudget({
	metric: "lcp",
	label: "LCP",
	threshold: 2500,
	format: milliseconds
});

//#endregion
export { dataSchema, lcp_budget_default as default };