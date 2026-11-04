import { a as harRuleDataSchema, d as sameHostResponses, f as tokens, i as harRule, o as header, t as COMPRESSED_ENCODINGS, u as resourceKind } from "../../../../../har.js";

//#region src/audit/catalog/categories/performance/rules/content-encoding.ts
const dataSchema = harRuleDataSchema;
const MIN_BYTES = {
	html: 1024,
	js: 10 * 1024,
	css: 10 * 1024
};
var content_encoding_default = harRule("same-host HTML (1 KiB+), JavaScript and CSS (10 KiB+) responses", (match) => {
	const eligible = sameHostResponses(match).filter(({ entry }) => {
		const min = MIN_BYTES[resourceKind(entry)];
		const size = entry.response.content?.size;
		return min !== void 0 && typeof size === "number" && size >= min;
	});
	const failures = eligible.flatMap((item) => {
		const encoding = header(item.entry, "content-encoding");
		if (tokens(encoding).some((token) => COMPRESSED_ENCODINGS.includes(token))) return [];
		return [{
			entry: item,
			reasons: [`${resourceKind(item.entry).toUpperCase()} response of ${Math.round((item.entry.response.content?.size ?? 0) / 1024)} KiB has no br, gzip or zstd Content-Encoding.`],
			headers: {
				"content-type": header(item.entry, "content-type"),
				"content-encoding": encoding
			}
		}];
	});
	return {
		responses: eligible.length,
		failures
	};
}, "are compressed with Brotli, gzip or zstd");

//#endregion
export { dataSchema, content_encoding_default as default };