import { o as readImageRun } from "../../../../../images.js";
import { z } from "zod";

//#region src/audit/catalog/categories/performance/rules/image-dimensions.ts
/** Shifts smaller than this aren't noticeable. */
const MIN_SHIFT = .01;
const UNSIZED_CAUSE = "Unsized image element";
const elementSchema = z.object({
	selector: z.string().nullable(),
	top: z.number().nullable(),
	bottom: z.number().nullable()
}).strict();
const dataSchema = z.object({
	cell: z.string(),
	minShift: z.number(),
	pages: z.array(z.object({
		page: z.string(),
		lighthouseArtifact: z.string(),
		cls: z.number().nullable(),
		unsizedShift: z.number(),
		shifts: z.array(z.object({
			cluster: z.number(),
			score: z.number(),
			element: elementSchema,
			culprits: z.array(elementSchema.extend({
				url: z.string().nullable(),
				plausible: z.boolean()
			}).strict())
		}).strict()),
		unsizedImages: z.array(elementSchema.extend({ url: z.string() }).strict())
	}).strict()),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();
const SRC = /\ssrc="([^"]+)"/;
const element = (node) => ({
	selector: node?.selector ?? null,
	top: node?.boundingRect?.top ?? null,
	bottom: node?.boundingRect?.bottom ?? null
});
/**
* Lighthouse's layout shift culprits insight links a shift to unsized images by timing, so it can name an image that
* is nowhere near the shifted element. An image moves an element only from above it or beside it, so culprits that
* start below the element's top are marked implausible and don't count.
*/
function unsizedShifts(run$1) {
	const urls = new Map((run$1.lhr.audits["unsized-images"]?.details?.items ?? []).flatMap((item) => item.url && item.node?.path ? [[item.node.path, item.url]] : []));
	const shifts = [];
	let unsizedShift = 0;
	(run$1.lhr.audits["cls-culprits-insight"]?.details?.items ?? []).forEach((cluster, index) => {
		let clusterShift = 0;
		for (const row of cluster.items ?? []) {
			const causes = (row.subItems?.items ?? []).filter((item) => item.cause === UNSIZED_CAUSE);
			if (!causes.length || !row.node?.selector) continue;
			const shifted = element(row.node);
			const culprits = causes.flatMap(({ extra }) => {
				if (!extra?.selector) return [];
				const src = extra.snippet?.match(SRC)?.[1];
				const url = extra.path && urls.get(extra.path) || (src && !src.includes("…") ? src : null);
				const image = element(extra);
				return [{
					...image,
					url,
					plausible: image.top === null || shifted.top === null || image.top <= shifted.top
				}];
			});
			const score = row.score ?? 0;
			shifts.push({
				cluster: index,
				score,
				element: shifted,
				culprits
			});
			if (causes.length > culprits.length || culprits.some((culprit) => culprit.plausible)) clusterShift += score;
		}
		unsizedShift = Math.max(unsizedShift, clusterShift);
	});
	return {
		unsizedShift,
		shifts
	};
}
const round = (value) => value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
const run = async ({ pages, playhouse }) => {
	const data = {
		cell: "mobile-cold",
		minShift: MIN_SHIFT,
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
		if (!imageRun.lhr.audits["cls-culprits-insight"]) {
			data.skipped.push({
				page: page.label,
				reason: "The Lighthouse result has no layout shift culprits insight."
			});
			continue;
		}
		data.pages.push({
			page: page.label,
			lighthouseArtifact: imageRun.lighthouseArtifact,
			cls: imageRun.lhr.audits["cumulative-layout-shift"]?.numericValue ?? null,
			...unsizedShifts(imageRun),
			unsizedImages: (imageRun.lhr.audits["unsized-images"]?.details?.items ?? []).flatMap((item) => item.url ? [{
				url: item.url,
				...element(item.node)
			}] : [])
		});
	}
	if (!data.pages.length) return { data };
	if (data.pages.some((item) => item.unsizedShift >= MIN_SHIFT)) return { data };
	const unsized = data.pages.reduce((total, item) => total + item.unsizedImages.length, 0);
	return {
		data,
		decision: {
			status: "pass",
			summary: `Images without dimensions cause no noticeable layout shift on ${data.pages.map((item) => item.page).join(", ")}${unsized ? `; Lighthouse lists ${unsized} image${unsized === 1 ? "" : "s"} without width and height, but their layout reserves the space` : ""}.`,
			evidence: data.pages.map((item) => ({
				type: "playhouse",
				page: item.page,
				artifact: item.lighthouseArtifact,
				pointer: "/audits/cls-culprits-insight",
				value: `CLS ${round(item.cls ?? 0)}, ${round(item.unsizedShift)} from unsized images`
			}))
		}
	};
};
var image_dimensions_default = run;

//#endregion
export { dataSchema, image_dimensions_default as default };