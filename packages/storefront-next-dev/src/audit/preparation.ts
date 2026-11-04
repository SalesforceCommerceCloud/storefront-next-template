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
import { access, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { AUDIT_ROOT } from './assets';
import type { BundleAnalysis } from './bundle/schema';
import type { AuditCatalog, AuditRule } from './catalog';
import { PlayhouseArtifactReader } from './evidence';
import type { PlayhouseCollection } from './playhouse';
import { evidenceSchema, SEVERITY_ORDER } from './results';
import { sanitizeJsonValue } from './sanitize';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const decisionSchema = z
    .object({
        /** `not-verified`: the evidence the rule needs wasn't collected (e.g. the project didn't build), so there's nothing for the AI to judge. */
        status: z.enum(['pass', 'fail', 'not-verified']),
        /** A failure's severity when it depends on the measured impact; capped at the rule's severity. */
        severity: z.enum(SEVERITY_ORDER).optional(),
        summary: z.string().min(1),
        evidence: z.array(evidenceSchema),
    })
    .strict()
    .refine((value) => value.status === 'not-verified' || value.evidence.length > 0, {
        message: 'a pass or fail decision requires evidence',
        path: ['evidence'],
    });

export const preparedRuleResultSchema = z
    .object({
        data: z.json(),
        decision: decisionSchema.optional(),
    })
    .strict();

export type PreparedRuleResult<TData = JsonValue> = { data: TData; decision?: z.infer<typeof decisionSchema> };
export type RuleResultReference = { ruleId: string; path: string };

export type RulePreparationContext = {
    rule: AuditRule;
    pages: readonly PlayhouseCollection[];
    playhouse: PlayhouseArtifactReader;
    /** The run's bundle analysis (`bundle/analysis.json`); absent when the caller didn't produce one. */
    bundle?: BundleAnalysis;
};

export type RulePreparationFunction<TData> = (
    context: RulePreparationContext
) => PreparedRuleResult<TData> | Promise<PreparedRuleResult<TData>>;

export type RulePreparationModule<TData> = {
    dataSchema: z.ZodType<TData>;
    default: RulePreparationFunction<TData>;
};

export type PreparedRuleOutput = { reference: RuleResultReference; result: PreparedRuleResult };

type PrepareRuleResultsOptions = {
    catalog: AuditCatalog;
    pages: readonly PlayhouseCollection[];
    workspaceRoot: string;
    companionRoot?: string | false;
    bundle?: BundleAnalysis;
};

function contained(base: string, candidate: string): boolean {
    const relative = path.relative(base, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function ruleParts(ruleId: string): { category: string; name: string } {
    const match = /^([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(ruleId);
    if (!match) throw new Error(`Invalid rule id: ${ruleId}`);
    return { category: match[1], name: match[2] };
}

export function resultPathForRule(ruleId: string): string {
    const { category, name } = ruleParts(ruleId);
    return path.posix.join('results', 'categories', category, 'rules', `${name}.json`);
}

/** Where the AI writes its evaluation of an undecided rule. */
export function aiAnalysisPathForRule(ruleId: string): string {
    const { category, name } = ruleParts(ruleId);
    return path.posix.join('ai-analysis', 'categories', category, 'rules', `${name}.json`);
}

export function defaultCompanionRoot(): string {
    return path.join(AUDIT_ROOT, 'catalog', 'categories');
}

async function exists(file: string): Promise<boolean> {
    try {
        await access(file);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }
}

async function discoverCompanions(root: string, catalog: AuditCatalog): Promise<Map<string, string>> {
    if (!(await exists(root))) return new Map();
    const canonicalRoot = await realpath(root);
    const known = new Set(catalog.ruleIds);
    const companions = new Map<string, string>();
    for (const category of (await readdir(canonicalRoot, { withFileTypes: true }))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))) {
        if (!category.isDirectory() || !/^[a-z0-9-]+$/.test(category.name)) continue;
        const rulesDirectory = path.join(canonicalRoot, category.name, 'rules');
        if (!(await exists(rulesDirectory))) continue;
        if ((await lstat(rulesDirectory)).isSymbolicLink())
            throw new Error(`Companion rules directory must not be a symlink: ${category.name}`);
        for (const entry of (await readdir(rulesDirectory, { withFileTypes: true }))
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))) {
            // Companions are .ts beside the catalog in source (tests) and .js in the build.
            const match = /^(.+)\.[jt]s$/.exec(entry.name);
            if (!entry.isFile() || !match || /\.(?:test|d)$/.test(match[1])) continue;
            const name = match[1];
            if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid companion filename: ${entry.name}`);
            const ruleId = `${category.name}/${name}`;
            if (!known.has(ruleId)) throw new Error(`Companion has no matching catalog rule: ${ruleId}`);
            const file = path.join(rulesDirectory, entry.name);
            const canonicalFile = await realpath(file);
            if (!contained(canonicalRoot, canonicalFile) || (await lstat(file)).isSymbolicLink())
                throw new Error(`Unsafe companion path for ${ruleId}`);
            companions.set(ruleId, canonicalFile);
        }
    }
    return companions;
}

function moduleShape(value: unknown, ruleId: string): RulePreparationModule<JsonValue> {
    const candidate = value as Partial<RulePreparationModule<JsonValue>>;
    if (
        typeof candidate?.default !== 'function' ||
        !candidate.dataSchema ||
        typeof candidate.dataSchema.safeParse !== 'function'
    ) {
        throw new Error(`Companion for ${ruleId} must export dataSchema and a default function`);
    }
    return candidate as RulePreparationModule<JsonValue>;
}

export async function prepareRuleResults(options: PrepareRuleResultsOptions): Promise<readonly PreparedRuleOutput[]> {
    if (options.companionRoot === false) return [];
    const companions = await discoverCompanions(options.companionRoot ?? defaultCompanionRoot(), options.catalog);
    const rules = new Map(
        options.catalog.categories.flatMap((category) => category.rules.map((rule) => [rule.id, rule] as const))
    );
    const playhouse = new PlayhouseArtifactReader(options.pages);
    const outputs: PreparedRuleOutput[] = [];

    for (const [ruleId, modulePath] of [...companions].sort(([a], [b]) => a.localeCompare(b))) {
        const rule = rules.get(ruleId);
        if (!rule) throw new Error(`Rule script ${ruleId} has no rule in the catalog`);
        const module = moduleShape(await import(pathToFileURL(modulePath).href), ruleId);
        const common = preparedRuleResultSchema.parse(
            await module.default({
                rule,
                pages: options.pages,
                playhouse,
                ...(options.bundle ? { bundle: options.bundle } : {}),
            })
        );
        const parsedData = module.dataSchema.parse(common.data);
        const sanitized = preparedRuleResultSchema.parse(sanitizeJsonValue({ ...common, data: parsedData }));
        const result: PreparedRuleResult = {
            ...sanitized,
            data: module.dataSchema.parse(sanitized.data),
        } as PreparedRuleResult;
        const relativePath = resultPathForRule(ruleId);
        const outputPath = path.resolve(options.workspaceRoot, relativePath);
        if (!contained(path.resolve(options.workspaceRoot), outputPath))
            throw new Error(`Result path escaped workspace for ${ruleId}`);
        await mkdir(path.dirname(outputPath), { recursive: true });
        const canonicalWorkspace = await realpath(options.workspaceRoot);
        const canonicalParent = await realpath(path.dirname(outputPath));
        if (!contained(canonicalWorkspace, canonicalParent))
            throw new Error(`Result path escaped workspace for ${ruleId}`);
        await writeFile(path.join(canonicalParent, path.basename(outputPath)), `${JSON.stringify(result, null, 2)}\n`, {
            flag: 'wx',
        });
        outputs.push({ reference: { ruleId, path: relativePath }, result });
    }
    return outputs;
}

/** Read the rule script results present in `results/` for the given rules. Rules without a script have no file. */
export async function readPreparedRuleResults(
    workspaceRoot: string,
    ruleIds: readonly string[]
): Promise<readonly PreparedRuleOutput[]> {
    const workspace = path.resolve(workspaceRoot);
    const outputs: PreparedRuleOutput[] = [];
    for (const ruleId of ruleIds) {
        const relativePath = resultPathForRule(ruleId);
        const file = path.resolve(workspace, relativePath);
        if (!(await exists(file))) continue;
        if ((await lstat(file)).isSymbolicLink() || !contained(await realpath(workspace), await realpath(file)))
            throw new Error(`Unsafe prepared result path: ${relativePath}`);
        const parsed = preparedRuleResultSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
        if (!parsed.success) throw new Error(`${relativePath} is invalid: ${parsed.error.message}`);
        outputs.push({ reference: { ruleId, path: relativePath }, result: parsed.data as PreparedRuleResult });
    }
    return outputs;
}
