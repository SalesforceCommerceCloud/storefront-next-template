import { a as harRuleDataSchema, d as sameHostResponses, i as harRule, o as header, r as cacheControl, u as resourceKind } from "../../../../../har.js";

//#region src/audit/catalog/categories/performance/rules/cache-control.ts
const dataSchema = harRuleDataSchema;
const YEAR = 31536e3;
const HOUR = 3600;
const DAY = 86400;
/** A content hash before the extension, e.g. `entry.client-Be9z2OkY.js` or `main.3f2a9c0d.css`; it needs a digit or an uppercase letter so words don't count. */
function fingerprinted(url) {
	const hash = /[.-]([A-Za-z0-9_-]{8}|[a-f0-9]{8,})\.(?:m?js|css)$/.exec(new URL(url).pathname)?.[1];
	return hash !== void 0 && /[0-9A-Z]/.test(hash);
}
function minimumMaxAge(entry) {
	const kind = resourceKind(entry);
	if (kind === "js" || kind === "css") return fingerprinted(entry.request.url) ? {
		seconds: YEAR,
		label: "a fingerprinted asset"
	} : {
		seconds: HOUR,
		label: "a non-fingerprinted script or stylesheet"
	};
	if (kind === "image" || kind === "font") return {
		seconds: DAY,
		label: `a public ${kind}`
	};
}
var cache_control_default = harRule("same-host script, stylesheet, image and font responses", (match) => {
	const eligible = sameHostResponses(match).flatMap((item) => {
		const minimum = minimumMaxAge(item.entry);
		return minimum ? [{
			item,
			minimum
		}] : [];
	});
	const failures = eligible.flatMap(({ item, minimum }) => {
		const value = header(item.entry, "cache-control");
		const directives = cacheControl(item.entry);
		const reasons = [];
		if (!value) reasons.push("Cache-Control is missing.");
		else {
			for (const directive of ["private", "no-store"]) if (directives.has(directive)) reasons.push(`Cache-Control is ${directive}.`);
			const maxAge = directives.get("max-age");
			if (maxAge === void 0 || !/^\d+$/.test(maxAge)) reasons.push("Cache-Control has no valid max-age.");
			else if (Number(maxAge) < minimum.seconds) reasons.push(`max-age=${maxAge} is under ${minimum.seconds} seconds for ${minimum.label}.`);
		}
		return reasons.length ? [{
			entry: item,
			reasons,
			headers: { "cache-control": value }
		}] : [];
	});
	return {
		responses: eligible.length,
		failures
	};
}, "have long enough Cache-Control lifetimes");

//#endregion
export { dataSchema, cache_control_default as default };