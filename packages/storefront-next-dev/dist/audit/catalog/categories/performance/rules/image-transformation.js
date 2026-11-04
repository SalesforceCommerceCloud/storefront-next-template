import { a as kib, i as isImage, o as readImageRun, t as MIN_SAVINGS_BYTES } from "../../../../../images.js";
import { z } from "zod";

//#region src/audit/catalog/categories/performance/rules/image-transformation.ts
/** Dynamic Imaging Service URLs: `/dw/image/v2/<realm>/on/demandware.static/...`. */
const DIS_PATH = /\/dw\/image\/v\d+\//i;
/** B2C Commerce static files (catalog and library images) served as uploaded. */
const STATIC_PATH = /\/on\/demandware\.static\//i;
/** Formats DIS isn't used for here: vector images, and animated GIFs (`performance/large-images` suggests a video). */
const OUT_OF_SCOPE = /^image\/(svg\+xml|gif|x-icon|vnd\.microsoft\.icon)/;
const LEGACY = /^image\/(jpeg|png)/;
const problemSchema = z.enum([
	"bypasses-dis",
	"not-resized",
	"legacy-format"
]);
const dataSchema = z.object({
	cell: z.string(),
	minBytes: z.number(),
	pages: z.array(z.object({
		page: z.string(),
		harArtifact: z.string(),
		checked: z.number(),
		dis: z.number(),
		images: z.array(z.object({
			url: z.string(),
			entry: z.number(),
			bytes: z.number(),
			mimeType: z.string(),
			problems: z.array(problemSchema),
			lcp: z.boolean(),
			requestedBeforeLcp: z.boolean().nullable()
		}).strict())
	}).strict()),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();
function problems(url, mimeType) {
	if (!DIS_PATH.test(url.pathname)) return ["bypasses-dis"];
	const found = [];
	if (!url.searchParams.has("sw") && !url.searchParams.has("sh")) found.push("not-resized");
	if (LEGACY.test(mimeType)) found.push("legacy-format");
	return found;
}
const run = async ({ pages, playhouse }) => {
	const data = {
		cell: "mobile-cold",
		minBytes: MIN_SAVINGS_BYTES,
		pages: [],
		skipped: []
	};
	for (const page of pages) {
		const imageRun = await readImageRun(playhouse, page.label);
		if ("reason" in imageRun) {
			data.skipped.push({
				page: page.label,
				reason: imageRun.reason
			});
			continue;
		}
		const result = {
			page: page.label,
			harArtifact: imageRun.harArtifact,
			checked: 0,
			dis: 0,
			images: []
		};
		imageRun.entries.forEach((entry, index) => {
			const mimeType = entry.response.content?.mimeType ?? "";
			const bytes = entry.response.bodySize ?? 0;
			if (!isImage(entry) || entry.response.status !== 200 || OUT_OF_SCOPE.test(mimeType) || bytes < MIN_SAVINGS_BYTES) return;
			let url;
			try {
				url = new URL(entry.request.url);
			} catch {
				return;
			}
			if (!DIS_PATH.test(url.pathname) && !STATIC_PATH.test(url.pathname)) return;
			result.checked += 1;
			if (DIS_PATH.test(url.pathname)) result.dis += 1;
			const found = problems(url, mimeType);
			const start = imageRun.startMs(entry);
			if (found.length) result.images.push({
				url: entry.request.url,
				entry: index,
				bytes,
				mimeType,
				problems: found,
				lcp: entry.request.url === imageRun.lcpUrl,
				requestedBeforeLcp: Number.isFinite(start) && imageRun.lcpMs !== null ? start < imageRun.lcpMs : null
			});
		});
		data.pages.push(result);
	}
	const checked = data.pages.reduce((total, item) => total + item.checked, 0);
	if (!checked) return { data };
	if (data.pages.some((item) => item.images.length)) return { data };
	return {
		data,
		decision: {
			status: "pass",
			summary: `All ${checked} Commerce images of ${kib(MIN_SAVINGS_BYTES)} or more on ${data.pages.filter((item) => item.checked).map((item) => item.page).join(", ")} are resized by DIS and served as WebP or AVIF.`,
			evidence: data.pages.filter((item) => item.checked).map((item) => ({
				type: "playhouse",
				page: item.page,
				artifact: item.harArtifact,
				value: `${item.checked} Commerce image${item.checked === 1 ? "" : "s"} checked, all through DIS`
			}))
		}
	};
};
var image_transformation_default = run;

//#endregion
export { dataSchema, image_transformation_default as default };