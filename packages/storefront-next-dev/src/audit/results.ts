/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { z } from 'zod';
import { MIN_RECOMMENDED_BYTES, bundleAnalysisSchema, type BundleAnalysis } from './bundle/schema';
import type { AuditCatalog } from './catalog';
import { GUIDANCE, guidanceFor } from './guidance';
import { RUN_ID } from './runs';
import { sanitizeJsonValue, sanitizeText, sanitizeUrl } from './sanitize';

/** Archive file name of the per-page Lighthouse HTML report. When present it is
 * recorded in `artifacts` as `{ available: true }` and served by the dashboard
 * server rather than embedded. ui/src/panels/Performance.tsx repeats this name. */
export const LIGHTHOUSE_REPORT = 'report-mobile-cold.html';

/** The workspace's prepared.json, written by `prepare` and read by `finalize` and the dashboard server. */
export const preparedSchema = z
    .object({
        schemaVersion: z.literal('1.0'),
        run: z
            .object({
                id: z.string().regex(RUN_ID),
                generatedAt: z.string().datetime(),
                toolVersion: z.string(),
                playhouseVersion: z.string().optional(),
            })
            .strict(),
        project: z.object({ root: z.string(), packageName: z.string().optional() }).strict(),
        instructions: z.string().optional(),
        pages: z.array(z.object({ label: z.string(), url: z.string(), archiveDir: z.string() }).strict()),
        pageFailures: z.array(z.object({ label: z.string(), url: z.string(), error: z.string() }).strict()).optional(),
        expectedPages: z.array(z.string()).optional(),
        coverage: z
            .array(z.object({ page: z.string(), status: z.literal('missing'), note: z.string() }).strict())
            .optional()
            .default([]),
        rules: z.array(
            z
                .object({
                    ruleId: z.string(),
                    title: z.string(),
                    file: z.string(),
                    data: z.string().optional(),
                    output: z.string(),
                })
                .strict()
        ),
        decidedFindings: z.array(
            z.object({ ruleId: z.string(), title: z.string(), severity: z.string(), summary: z.string() }).strict()
        ),
    })
    .strict();
export function parsePrepared(value: unknown): z.infer<typeof preparedSchema> {
    const parsed = preparedSchema.safeParse(value);
    if (!parsed.success) throw new Error(`prepared.json is invalid: ${parsed.error.message}`);
    return parsed.data;
}

export const evidenceSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('source'),
        file: z.string(),
        line: z.number().int().positive().optional(),
        excerpt: z.string().optional(),
    }),
    z.object({
        type: z.literal('playhouse'),
        page: z.string(),
        artifact: z.string(),
        pointer: z.string().optional(),
        value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    }),
    z.object({ type: z.literal('manual'), description: z.string(), location: z.string().optional() }),
]);
/** The one rule whose evaluation may carry a `waterfall`: the per-page server request graph drawn on the Performance tab. */
export const WATERFALL_RULE_ID = 'performance/server-request-waterfall';
export const waterfallStepSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        kind: z.enum(['middleware', 'loader', 'api', 'render']),
        label: z.string().min(1),
        service: z.enum(['scapi', 'slas', 'ocapi', 'einstein', 'data-store', 'other']).optional(),
        source: z.object({ file: z.string(), line: z.number().int().positive().optional() }).strict(),
        // Ids of the steps this one waits on; empty means it starts with its phase.
        after: z.array(z.string()).default([]),
        // false: returned as an un-awaited promise and streamed, so it does not hold back the shell.
        blocking: z.boolean(),
        conditional: z.string().optional(),
        note: z.string().optional(),
        // Critical data (LCP, above-the-fold or SEO content) should stay awaited; the rest can stream.
        critical: z.boolean().optional(),
        // A suggested change the customer may choose to make; absent when the call is fine as it is (a chain can be necessary).
        opportunity: z.enum(['parallelize', 'scapi-hook', 'stream']).optional(),
    })
    .strict();
export const waterfallSchema = z
    .object({
        pages: z.array(
            z
                .object({
                    page: z.string(),
                    route: z.string(),
                    summary: z.string(),
                    steps: z.array(waterfallStepSchema).min(1).max(60),
                })
                .strict()
        ),
    })
    .strict();
/** The one rule whose evaluation may carry `recommendations`: the AI's suggestions in the Bundle size view. */
export const RECOMMENDATIONS_RULE_ID = 'performance/reduce-javascript-on-load';
export const RECOMMENDATION_CHANGES = [
    'lazy-component',
    'dynamic-import',
    'narrower-import',
    'replace',
    'remove',
] as const;
/** Changes that keep the code but load it later, so they need a trigger. */
const DEFERRING_CHANGES: ReadonlySet<string> = new Set(['lazy-component', 'dynamic-import']);
export const recommendationSchema = z
    .object({
        /** Pages whose local analysis has `target`; the change helps each of them. */
        pages: z.array(z.string()).min(1),
        /** One line naming the change: "Load the store locator map when its dialog opens". */
        title: z.string().min(1).max(140),
        change: z.enum(RECOMMENDATION_CHANGES),
        /** A candidate's `target`, or a package's `name`, in the pages' local analysis. */
        target: z.string().min(1),
        /** When deferred code is first needed (lazy-component and dynamic-import only). */
        trigger: z.enum(['interaction', 'visible', 'navigation', 'idle']).optional(),
        /** The change itself, concretely enough to make it: what to import from where, and what keeps working. */
        how: z.string().min(1).max(1200),
        /** Where to make it. */
        files: z
            .array(z.object({ file: z.string(), line: z.number().int().positive().optional() }).strict())
            .min(1)
            .max(10),
        // Set by finalize from bundle/analysis.json; the analysis never supplies sizes. `upTo` when the change keeps or
        // replaces part of the code, so the real saving is smaller.
        savings: z
            .array(z.object({ page: z.string(), bytes: z.number().int().nonnegative(), upTo: z.boolean() }).strict())
            .optional(),
    })
    .strict();
export const recommendationsSchema = z.array(recommendationSchema).max(30);
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;
// not-verified: the audit could not collect the evidence the rule needs. It is listed for manual
// follow-up and never changes the launch guidance.
export const evaluationSchema = z
    .object({
        ruleId: z.string(),
        disposition: z.enum(['pass', 'finding', 'not-applicable', 'not-verified']),
        // Set by finalize from the rule's Intent: what the rule checks, the same in every run.
        title: z.string(),
        description: z.string().optional(),
        severity: z.enum(SEVERITY_ORDER).optional(),
        summary: z.string(),
        remediation: z.string().optional(),
        evidence: z.array(evidenceSchema),
        // Set by finalize: 'script' for a rule companion's decision, 'ai' for the agent's evaluation.
        method: z.enum(['script', 'ai']).optional(),
        waterfall: waterfallSchema.optional(),
        recommendations: recommendationsSchema.optional(),
    })
    .superRefine((value, context) => {
        if (value.disposition === 'finding' && value.evidence.length === 0)
            context.addIssue({ code: 'custom', message: 'finding requires evidence', path: ['evidence'] });
    });
export const guidanceSchema = z.enum(GUIDANCE);
export const auditResultSchema = z.object({
    schemaVersion: z.literal('1.0'),
    run: z.object({ id: z.string(), generatedAt: z.string(), toolVersion: z.string() }),
    project: z.object({ name: z.string().optional() }),
    pages: z.array(
        z.object({
            label: z.string(),
            url: z.string(),
            playhouse: z.object({
                archiveDir: z.string(),
                version: z.string(),
                lighthouseVersion: z.string(),
                artifacts: z.record(z.string(), z.json()),
            }),
        })
    ),
    catalog: z.object({
        categories: z.array(z.object({ id: z.string(), title: z.string(), ruleIds: z.array(z.string()) })),
        ruleIds: z.array(z.string()),
    }),
    evaluations: z.array(evaluationSchema),
    observations: z
        .array(
            z.object({
                title: z.string(),
                category: z.string().optional(),
                summary: z.string(),
                evidence: z.array(evidenceSchema),
            })
        )
        .default([]),
    coverage: z.array(
        z.object({
            category: z.string().optional(),
            ruleId: z.string().optional(),
            page: z.string().optional(),
            status: z.enum(['covered', 'partial', 'missing']),
            note: z.string(),
        })
    ),
    // narrative is a one-sentence headline; highlights are the short points under it, most important first.
    summary: z
        .object({ guidance: guidanceSchema, narrative: z.string(), highlights: z.array(z.string()).max(6).default([]) })
        .optional(),
    // The run's bundle/analysis.json, for the Bundle size view.
    bundle: bundleAnalysisSchema.optional(),
});
export type AuditResult = z.infer<typeof auditResultSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Waterfall = z.infer<typeof waterfallSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type WaterfallStep = z.infer<typeof waterfallStepSchema>;
/** Files present in each page's Playhouse archive, keyed by page label. */
export type ArchiveFiles = ReadonlyMap<string, ReadonlySet<string>>;

export function validateEvidence(evidence: Evidence, archiveFiles: ArchiveFiles): void {
    if (evidence.type === 'source' && (evidence.file.split(/[\\/]/).includes('..') || pathIsAbsolute(evidence.file)))
        throw new Error(`Unsafe source evidence file: ${evidence.file}`);
    if (evidence.type === 'playhouse') {
        const files = archiveFiles.get(evidence.page);
        if (!files) throw new Error(`Unknown Playhouse evidence page: ${evidence.page}`);
        if (!files.has(evidence.artifact))
            throw new Error(`Unknown Playhouse evidence artifact for ${evidence.page}: ${evidence.artifact}`);
    }
}

/** A waterfall belongs only to its rule, names captured pages once each, and is an acyclic graph of known steps. */
export function validateWaterfall(evaluation: z.infer<typeof evaluationSchema>, pageLabels: ReadonlySet<string>): void {
    if (!evaluation.waterfall) return;
    if (evaluation.ruleId !== WATERFALL_RULE_ID) throw new Error(`waterfall is only supported on ${WATERFALL_RULE_ID}`);
    const seenPages = new Set<string>();
    for (const entry of evaluation.waterfall.pages) {
        if (!pageLabels.has(entry.page)) throw new Error(`Unknown waterfall page: ${entry.page}`);
        if (seenPages.has(entry.page)) throw new Error(`Duplicate waterfall page: ${entry.page}`);
        seenPages.add(entry.page);
        const steps = new Map<string, WaterfallStep>();
        for (const step of entry.steps) {
            if (steps.has(step.id)) throw new Error(`Duplicate waterfall step on ${entry.page}: ${step.id}`);
            steps.set(step.id, step);
            validateEvidence({ type: 'source', file: step.source.file }, new Map());
        }
        for (const step of entry.steps) {
            for (const id of step.after)
                if (!steps.has(id))
                    throw new Error(`Waterfall step ${step.id} on ${entry.page} waits on unknown step: ${id}`);
            if (step.opportunity === 'stream' && (!step.blocking || step.critical))
                throw new Error(
                    `Waterfall step ${step.id} on ${entry.page} can only suggest streaming when it is awaited and not critical`
                );
            if ((step.opportunity === 'parallelize' || step.opportunity === 'scapi-hook') && !step.after.length)
                throw new Error(
                    `Waterfall step ${step.id} on ${entry.page} suggests ${step.opportunity} but waits on nothing`
                );
        }
        const done = new Set<string>();
        const visiting = new Set<string>();
        const visit = (id: string): void => {
            if (done.has(id)) return;
            if (visiting.has(id)) throw new Error(`Waterfall on ${entry.page} has a cycle through step: ${id}`);
            visiting.add(id);
            for (const next of steps.get(id)?.after ?? []) visit(next);
            visiting.delete(id);
            done.add(id);
        };
        for (const id of steps.keys()) visit(id);
    }
}

/**
 * Recommendations belong only to their rule, and each names a candidate or a package of every page it lists in the
 * bundle analysis, whose bytes it takes. Without `bundle` (re-validating a finished result) only the rule, pages and
 * files are checked.
 */
export function validateRecommendations(
    evaluation: z.infer<typeof evaluationSchema>,
    pageLabels: ReadonlySet<string>,
    bundle?: BundleAnalysis
): void {
    if (!evaluation.recommendations) return;
    if (evaluation.ruleId !== RECOMMENDATIONS_RULE_ID)
        throw new Error(`recommendations is only supported on ${RECOMMENDATIONS_RULE_ID}`);
    const seen = new Set<string>();
    for (const item of evaluation.recommendations) {
        const label = `${item.change} ${item.target}`;
        if (seen.has(label)) throw new Error(`Duplicate recommendation: ${label}`);
        seen.add(label);
        if (new Set(item.pages).size !== item.pages.length)
            throw new Error(`Recommendation ${label} lists a page twice`);
        for (const page of item.pages)
            if (!pageLabels.has(page)) throw new Error(`Unknown recommendation page: ${page}`);
        for (const file of item.files) validateEvidence({ type: 'source', file: file.file }, new Map());
        const deferring = DEFERRING_CHANGES.has(item.change);
        if (deferring !== Boolean(item.trigger))
            throw new Error(
                `Recommendation ${label} ${deferring ? 'needs a trigger' : 'only defers code with lazy-component or dynamic-import, so it takes no trigger'}`
            );
        if (!bundle) continue;
        item.savings = item.pages.map((page) => {
            const local = bundle.pages.find((entry) => entry.page === page)?.local;
            const candidate = local?.candidates.find((entry) => entry.target === item.target);
            const owner = local?.packages.find((entry) => entry.name === item.target && entry.kind !== 'build');
            if (candidate) {
                const file = item.files.find((entry) => entry.file === candidate.importer.file);
                if (file && candidate.importer.line) file.line ??= candidate.importer.line;
                return { page, bytes: candidate.savedBytes, upTo: !deferring };
            }
            if (owner)
                return deferring && owner.deferrableBytes !== undefined
                    ? { page, bytes: owner.deferrableBytes, upTo: false }
                    : { page, bytes: owner.bytes, upTo: true };
            throw new Error(
                `Recommendation ${label}: ${item.target} is not a candidate or package of ${page} in bundle/analysis.json`
            );
        });
        const most = Math.max(...item.savings.map((entry) => entry.bytes));
        if (most < MIN_RECOMMENDED_BYTES)
            throw new Error(
                `Recommendation ${label} saves at most ${Math.round(most / 1024)} KiB on its pages, below the ${MIN_RECOMMENDED_BYTES / 1024} KiB worth recommending; leave it out`
            );
    }
}

/** `archiveFiles` defaults to the artifacts embedded in `input.pages`. */
export function validateAuditResult(input: unknown, catalog?: AuditCatalog, archiveFiles?: ArchiveFiles): AuditResult {
    const result = auditResultSchema.parse(input);
    assertUniquePageLabels(result.pages);
    if (
        !catalog &&
        result.evaluations.some((evaluation) => evaluation.disposition === 'finding' && !evaluation.severity)
    )
        throw new Error('finding requires severity');
    const declaredRules = result.catalog.categories.flatMap((category) => category.ruleIds);
    if (
        new Set(declaredRules).size !== declaredRules.length ||
        declaredRules.slice().sort().join('\n') !== result.catalog.ruleIds.slice().sort().join('\n')
    )
        throw new Error('Catalog categories and ruleIds are inconsistent');
    for (const category of result.catalog.categories)
        for (const ruleId of category.ruleIds)
            if (!ruleId.startsWith(`${category.id}/`))
                throw new Error(`Catalog rule ${ruleId} is not in category ${category.id}`);
    if (catalog) {
        const known = new Set(catalog.ruleIds);
        const categories = new Set(catalog.categories.map((category) => category.id));
        const pages =
            archiveFiles ??
            new Map(result.pages.map((page) => [page.label, new Set(Object.keys(page.playhouse.artifacts))]));
        const severityByRule = new Map(
            catalog.categories.flatMap((category) => category.rules.map((rule) => [rule.id, rule.severity] as const))
        );
        const evaluated = new Set<string>();
        for (const evaluation of result.evaluations) {
            if (!known.has(evaluation.ruleId)) throw new Error(`Unknown rule id: ${evaluation.ruleId}`);
            if (evaluated.has(evaluation.ruleId)) throw new Error(`Duplicate evaluation: ${evaluation.ruleId}`);
            if (evaluation.disposition === 'finding') {
                // The rule's severity is a ceiling: an analysis may lower it when the impact is smaller, never raise it.
                const ceiling = severityByRule.get(evaluation.ruleId);
                if (!ceiling) throw new Error(`Rule ${evaluation.ruleId} has no category in the catalog`);
                const supplied = evaluation.severity;
                evaluation.severity =
                    supplied && SEVERITY_ORDER.indexOf(supplied) > SEVERITY_ORDER.indexOf(ceiling) ? supplied : ceiling;
            }
            evaluated.add(evaluation.ruleId);
        }
        for (const ruleId of catalog.ruleIds) {
            if (!evaluated.has(ruleId))
                result.evaluations.push({
                    ruleId,
                    disposition: 'not-verified',
                    title: ruleId,
                    summary: 'No evaluation was supplied.',
                    evidence: [],
                });
        }
        for (const evaluation of result.evaluations)
            for (const evidence of evaluation.evidence) validateEvidence(evidence, pages);
        for (const observation of result.observations)
            for (const evidence of observation.evidence) validateEvidence(evidence, pages);
        for (const item of result.coverage) {
            if (item.ruleId && !known.has(item.ruleId)) throw new Error(`Unknown coverage rule id: ${item.ruleId}`);
            if (item.category && !categories.has(item.category))
                throw new Error(`Unknown coverage category: ${item.category}`);
        }
        // Rule coverage is derived from each evaluation's disposition at render time, so it is not
        // duplicated into the coverage array here. Coverage carries only page- and category-level gaps.
        // Guidance always reflects the known findings; unverified rules and coverage gaps are reported beside it.
        result.summary = {
            guidance: guidanceFor(result.evaluations),
            narrative: result.summary?.narrative ?? '',
            highlights: result.summary?.highlights ?? [],
        };
        result.evaluations.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
        result.coverage.sort((a, b) =>
            `${a.category ?? ''}/${a.ruleId ?? ''}/${a.page ?? ''}`.localeCompare(
                `${b.category ?? ''}/${b.ruleId ?? ''}/${b.page ?? ''}`
            )
        );
    }
    const pageLabels = new Set(archiveFiles ? archiveFiles.keys() : result.pages.map((page) => page.label));
    for (const evaluation of result.evaluations) {
        validateWaterfall(evaluation, pageLabels);
        validateRecommendations(evaluation, pageLabels);
    }
    for (const page of result.pages) {
        page.url = sanitizeUrl(page.url);
        page.playhouse.archiveDir = '[PLAYHOUSE_ARCHIVE]';
        page.playhouse.artifacts = sanitizeJson(page.playhouse.artifacts) as typeof page.playhouse.artifacts;
    }
    for (const evaluation of result.evaluations) {
        evaluation.title = sanitizeText(evaluation.title);
        evaluation.summary = sanitizeText(evaluation.summary);
        if (evaluation.remediation) evaluation.remediation = sanitizeText(evaluation.remediation);
        for (const evidence of evaluation.evidence) sanitizeEvidence(evidence);
        for (const entry of evaluation.waterfall?.pages ?? []) {
            entry.route = sanitizeText(entry.route);
            entry.summary = sanitizeText(entry.summary);
            for (const step of entry.steps) {
                step.label = sanitizeText(step.label);
                if (step.conditional) step.conditional = sanitizeText(step.conditional);
                if (step.note) step.note = sanitizeText(step.note);
            }
        }
        for (const item of evaluation.recommendations ?? []) {
            item.title = sanitizeText(item.title);
            item.how = sanitizeText(item.how);
        }
    }
    if (result.bundle) result.bundle = bundleAnalysisSchema.parse(sanitizeJson(result.bundle));
    for (const observation of result.observations) {
        observation.title = sanitizeText(observation.title);
        observation.summary = sanitizeText(observation.summary);
        for (const evidence of observation.evidence) sanitizeEvidence(evidence);
    }
    for (const item of result.coverage) item.note = sanitizeText(item.note);
    if (result.summary) {
        result.summary.narrative = sanitizeText(result.summary.narrative);
        result.summary.highlights = result.summary.highlights.map(sanitizeText);
    }
    return result;
}

function assertUniquePageLabels(pages: readonly { label: string }[]): void {
    const labels = new Set<string>();
    for (const { label } of pages) {
        if (!/^[a-z][a-z0-9-]{0,63}$/.test(label)) throw new Error(`Invalid page label: ${label}`);
        if (labels.has(label)) throw new Error(`Duplicate page label: ${label}`);
        labels.add(label);
    }
}

export function auditResultJsonSchema(): unknown {
    return z.toJSONSchema(auditResultSchema);
}
function pathIsAbsolute(value: string): boolean {
    return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}
function sanitizeJson(value: unknown): unknown {
    return sanitizeJsonValue(value);
}
function sanitizeJsonPointer(pointer: string): string {
    if (!pointer.startsWith('/')) return sanitizeText(pointer);
    return pointer
        .split('/')
        .map((token, index) => (index === 0 ? '' : sanitizeText(token)))
        .join('/');
}
function sanitizeEvidence(evidence: z.infer<typeof evidenceSchema>): void {
    if (evidence.type === 'source' && evidence.excerpt) evidence.excerpt = sanitizeText(evidence.excerpt);
    else if (evidence.type === 'manual') {
        evidence.description = sanitizeText(evidence.description);
        if (evidence.location) evidence.location = sanitizeText(evidence.location);
    } else if (evidence.type === 'playhouse') {
        if (evidence.pointer) evidence.pointer = sanitizeJsonPointer(evidence.pointer);
        if (typeof evidence.value === 'string') evidence.value = sanitizeText(evidence.value);
    }
}
