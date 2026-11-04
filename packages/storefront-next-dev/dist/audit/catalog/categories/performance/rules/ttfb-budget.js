import "../../../../../measured-run.js";
import { n as metricBudget, r as milliseconds, t as dataSchema } from "../../../../../metric-budget.js";

//#region src/audit/catalog/categories/performance/rules/ttfb-budget.ts
var ttfb_budget_default = metricBudget({
	metric: "ttfb",
	label: "TTFB",
	threshold: 800,
	format: milliseconds,
	severityForFailure: (value) => value > 1800 ? "high" : "medium",
	validValue: (value) => value > 0,
	includeSpread: true,
	measurementLabel: "representative-run"
});

//#endregion
export { dataSchema, ttfb_budget_default as default };