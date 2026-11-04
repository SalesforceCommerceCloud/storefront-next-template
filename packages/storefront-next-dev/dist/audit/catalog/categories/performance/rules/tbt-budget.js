import "../../../../../measured-run.js";
import { n as metricBudget, r as milliseconds, t as dataSchema } from "../../../../../metric-budget.js";

//#region src/audit/catalog/categories/performance/rules/tbt-budget.ts
var tbt_budget_default = metricBudget({
	metric: "tbt",
	label: "TBT",
	threshold: 200,
	format: milliseconds
});

//#endregion
export { dataSchema, tbt_budget_default as default };