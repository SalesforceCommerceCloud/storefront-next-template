import { a as kib, o as readImageRun, t as MIN_SAVINGS_BYTES } from "../../../../../images.js";
import { z } from "zod";

//#region src/audit/catalog/categories/performance/rules/large-images.ts
/** An image is oversized when it has at least this many times the pixels the screen needs (srcset steps leave some slack). */
const MIN_PIXEL_RATIO = 2;
const reasonSchema = z.object({
	kind: z.enum([
		"oversized",
		"animated-gif",
		"format"
	]),
	savingsBytes: z.number(),
	detail: z.string()
}).strict();
const imageSchema = z.object({
	url: z.string(),
	item: z.number(),
	bytes: z.number(),
	shown: z.object({
		width: z.number(),
		height: z.number()
	}).strict().nullable(),
	intrinsic: z.object({
		width: z.number(),
		height: z.number()
	}).strict().nullable(),
	savingsBytes: z.number(),
	reasons: z.array(reasonSchema),
	selector: z.string().nullable(),
	label: z.string().nullable(),
	aboveFold: z.boolean().nullable(),
	requestedBeforeLcp: z.boolean().nullable()
}).strict();
const dataSchema = z.object({
	cell: z.string(),
	minSavingsBytes: z.number(),
	minPixelRatio: z.number(),
	pages: z.array(z.object({
		page: z.string(),
		dpr: z.number(),
		lcpMs: z.number().nullable(),
		lighthouseArtifact: z.string(),
		harArtifact: z.string(),
		lighthouseItems: z.number(),
		dropped: z.number(),
		totalSavingsBytes: z.number(),
		images: z.array(imageSchema)
	}).strict()),
	skipped: z.array(z.object({
		page: z.string(),
		reason: z.string()
	}).strict())
}).strict();
const SIZE_REASON = /\((\d+)x(\d+)\) for its displayed dimensions/;
/**
* Lighthouse's compression-only estimate isn't used: it targets a fixed number of bytes per CSS pixel, so it counts
* an image right-sized for a 3× screen as badly compressed (it put a q=70 DIS WebP of 21 KiB at 4 KiB, below what
* DIS produces even at q=30).
*/
function otherReason(reason) {
	if (/video formats/i.test(reason)) return "animated-gif";
	if (/modern image format|webp|avif/i.test(reason)) return "format";
	return null;
}
/**
* Lighthouse's image delivery insight compares each image with its displayed size in CSS pixels, which overstates the
* savings on high-density screens. This recomputes the resize savings at the emulated pixel density, and keeps
* Lighthouse's format and animated GIF savings.
*/
function oversizedImages(run$1) {
	const result = [];
	(run$1.lhr.audits["image-delivery-insight"]?.details?.items ?? []).forEach((item, index) => {
		const rect = item.node?.boundingRect;
		const shown = rect && rect.width > 0 && rect.height > 0 ? {
			width: Math.round(rect.width),
			height: Math.round(rect.height)
		} : null;
		const reasons = [];
		let intrinsic = null;
		for (const sub of item.subItems?.items ?? []) {
			const size = sub.reason.match(SIZE_REASON);
			if (size) {
				intrinsic = {
					width: Number(size[1]),
					height: Number(size[2])
				};
				if (!shown) continue;
				const needed = {
					width: Math.min(intrinsic.width, Math.ceil(shown.width * run$1.dpr)),
					height: Math.min(intrinsic.height, Math.ceil(shown.height * run$1.dpr))
				};
				const ratio = intrinsic.width * intrinsic.height / (needed.width * needed.height);
				const savings = Math.round(item.totalBytes * (1 - 1 / ratio));
				if (ratio >= MIN_PIXEL_RATIO && savings >= MIN_SAVINGS_BYTES) reasons.push({
					kind: "oversized",
					savingsBytes: savings,
					detail: `${intrinsic.width}×${intrinsic.height} delivered; ${needed.width}×${needed.height} shows it at ${shown.width}×${shown.height} on a ${run$1.dpr}× screen`
				});
				continue;
			}
			const kind = otherReason(sub.reason);
			if (kind && sub.wastedBytes >= MIN_SAVINGS_BYTES) reasons.push({
				kind,
				savingsBytes: Math.round(sub.wastedBytes),
				detail: sub.reason
			});
		}
		if (!reasons.length) return;
		const entry = run$1.entries.find((candidate) => candidate.request.url === item.url);
		const start = entry ? run$1.startMs(entry) : NaN;
		result.push({
			url: item.url,
			item: index,
			bytes: Math.round(item.totalBytes),
			shown,
			intrinsic,
			savingsBytes: Math.max(...reasons.map((reason) => reason.savingsBytes)),
			reasons,
			selector: item.node?.selector ?? null,
			label: item.node?.nodeLabel ?? null,
			aboveFold: rect ? rect.top < run$1.viewportHeight : null,
			requestedBeforeLcp: Number.isFinite(start) && run$1.lcpMs !== null ? start < run$1.lcpMs : null
		});
	});
	return result.slice().sort((a, b) => b.savingsBytes - a.savingsBytes);
}
const run = async ({ pages, playhouse }) => {
	const data = {
		cell: "mobile-cold",
		minSavingsBytes: MIN_SAVINGS_BYTES,
		minPixelRatio: MIN_PIXEL_RATIO,
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
		const insight = imageRun.lhr.audits["image-delivery-insight"];
		if (!insight) {
			data.skipped.push({
				page: page.label,
				reason: "The Lighthouse result has no image delivery insight."
			});
			continue;
		}
		const items = insight.details?.items?.length ?? 0;
		const images = oversizedImages(imageRun);
		data.pages.push({
			page: page.label,
			dpr: imageRun.dpr,
			lcpMs: imageRun.lcpMs,
			lighthouseArtifact: imageRun.lighthouseArtifact,
			harArtifact: imageRun.harArtifact,
			lighthouseItems: items,
			dropped: items - images.length,
			totalSavingsBytes: images.reduce((total, image) => total + image.savingsBytes, 0),
			images
		});
	}
	if (!data.pages.length) return { data };
	if (data.pages.some((item) => item.images.length)) return { data };
	return {
		data,
		decision: {
			status: "pass",
			summary: `No image on ${data.pages.map((item) => item.page).join(", ")} would save ${kib(MIN_SAVINGS_BYTES)} or more by resizing, converting to WebP or AVIF, or replacing an animated GIF.`,
			evidence: data.pages.map((item) => ({
				type: "playhouse",
				page: item.page,
				artifact: item.lighthouseArtifact,
				pointer: "/audits/image-delivery-insight",
				value: item.lighthouseItems ? `Lighthouse listed ${item.lighthouseItems} image${item.lighthouseItems === 1 ? "" : "s"}; each is right-sized for a ${item.dpr}× screen or would save less than ${kib(MIN_SAVINGS_BYTES)}` : "Lighthouse found no image delivery savings"
			}))
		}
	};
};
var large_images_default = run;

//#endregion
export { dataSchema, large_images_default as default };