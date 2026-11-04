//#region src/audit/measured-run.ts
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
const list = (value) => Array.isArray(value) ? value : [];
/** Playhouse writes 0 for a metric it could not measure. A rendered page always has a positive LCP, so a run without one measured nothing. */
function isMeasured(run) {
	const lcp = object(run)?.lcp;
	return typeof lcp === "number" && Number.isFinite(lcp) && lcp > 0;
}
/** A run row that has an LCP but not a positive one: Playhouse could not measure it. A row without an LCP can't say. */
const isFailedRow = (row) => typeof object(row)?.lcp === "number" && !isMeasured(row);
function median(values) {
	const sorted = values.slice().sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : sorted[mid] ?? 0;
}
/**
* A summary.json cell's representative run, leaving out runs Playhouse could not measure.
* Playhouse picks the run whose LCP is closest to the median of every run, zeros included, so one failed run
* can move the pick. When a run failed, this repeats Playhouse's selection (closest to the median, ties to the
* earlier run) over the measured runs only; otherwise it returns Playhouse's own `medianRun`.
* Undefined when the cell is missing or no run was measured.
* Playhouse versions that retry and skip a run without an LCP never write these zeros, but archives from
* older versions still contain them.
*/
function measuredRun(summary, cellIndex, eligible = isMeasured) {
	const root = object(summary);
	const cell = object(list(root?.cells)[cellIndex]);
	if (!cell) return void 0;
	const rows = list(root?.runs).map((entry, index) => ({
		entry: object(entry),
		index
	})).flatMap(({ entry, index }) => {
		const row = object(entry?.row);
		return row && typeof row.lcp === "number" && entry?.formFactor === cell.formFactor && entry?.cacheState === cell.cacheState ? [{
			row,
			index
		}] : [];
	});
	const measured = rows.filter(({ row }) => eligible(row));
	const medianRun = object(cell.medianRun);
	if (medianRun && eligible(medianRun) && measured.length === rows.length) return {
		run: medianRun,
		pointer: `/cells/${cellIndex}/medianRun`,
		unmeasuredRuns: 0
	};
	if (!measured.length) return void 0;
	const lcp = (item) => item.row.lcp;
	const target = median(measured.map(lcp));
	const closest = measured.reduce((best, item) => Math.abs(lcp(item) - target) < Math.abs(lcp(best) - target) ? item : best);
	return {
		run: closest.row,
		pointer: `/runs/${closest.index}/row`,
		unmeasuredRuns: rows.length - measured.length
	};
}
/** The mobile/cold (else first) cell's score and core metrics for the live progress screen. Returns no score
* when the artifact is absent or nothing was measured, so the dashboard never shows a fabricated number. */
function perfFromSummary(summary) {
	const mobileCold = list(object(summary)?.cells).findIndex((entry) => object(entry)?.formFactor === "mobile" && object(entry)?.cacheState === "cold");
	const run = measuredRun(summary, mobileCold >= 0 ? mobileCold : 0)?.run;
	if (!run) return { metrics: [] };
	const seconds = (value) => `${(value / 1e3).toFixed(1)}s`;
	const metrics = [];
	if (typeof run.lcp === "number") metrics.push({
		key: "LCP",
		value: seconds(run.lcp),
		bad: run.lcp > 2500
	});
	if (typeof run.tbt === "number") metrics.push({
		key: "TBT",
		value: `${Math.round(run.tbt)}ms`,
		bad: run.tbt > 200
	});
	if (typeof run.cls === "number") metrics.push({
		key: "CLS",
		value: run.cls.toFixed(2),
		bad: run.cls > .1
	});
	if (typeof run.ttfb === "number") metrics.push({
		key: "TTFB",
		value: seconds(run.ttfb),
		bad: run.ttfb > 800
	});
	return {
		score: typeof run.score === "number" ? run.score : void 0,
		metrics
	};
}

//#endregion
export { perfFromSummary as i, isMeasured as n, measuredRun as r, isFailedRow as t };