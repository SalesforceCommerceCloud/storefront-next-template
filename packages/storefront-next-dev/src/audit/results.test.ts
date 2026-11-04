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
import { describe, expect, it } from 'vitest';
import { fixture } from './__fixtures__/bundle';
import { analyzeBundle } from './bundle/analyze';
import { PlayhouseArtifactReader } from './evidence';
import { validateAuditResult, validateRecommendations } from './results';

const base = {
    schemaVersion: '1.0',
    run: { id: 'fixture', generatedAt: '2026-09-16T00:00:00.000Z', toolVersion: '0.2.0' },
    project: { name: 'store' },
    pages: [],
    catalog: { categories: [{ id: 'seo', title: 'SEO', ruleIds: ['seo/title'] }], ruleIds: ['seo/title'] },
    observations: [],
    coverage: [],
};
const titleOnly = { categories: [], ruleIds: ['seo/title'] } as never;
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const redact = (summary: string): string | undefined =>
    validateAuditResult(
        {
            ...base,
            evaluations: [{ ruleId: 'seo/title', disposition: 'not-verified', title: 'x', summary, evidence: [] }],
        },
        titleOnly
    ).evaluations[0]?.summary;

describe('validateAuditResult', () => {
    it('adds missing rules as not-verified', () => {
        const result = validateAuditResult({ ...base, evaluations: [] }, titleOnly);
        expect(result.evaluations[0]?.disposition).toBe('not-verified');
    });

    it('lets an evaluated rule pass', () => {
        const input = {
            ...base,
            evaluations: [
                {
                    ruleId: 'seo/title',
                    disposition: 'pass',
                    title: 'Title',
                    summary: 'Every page has a unique title.',
                    evidence: [{ type: 'manual', description: 'curl' }],
                },
            ],
        };
        expect(validateAuditResult(input, titleOnly).evaluations[0]?.disposition).toBe('pass');
        expect(validateAuditResult(input).evaluations[0]?.disposition).toBe('pass');
    });

    it('requires typed evidence for a finding', () => {
        expect(() =>
            validateAuditResult({
                ...base,
                evaluations: [
                    {
                        ruleId: 'seo/title',
                        disposition: 'finding',
                        title: 'Missing title',
                        severity: 'high',
                        summary: 'Absent',
                        evidence: [],
                    },
                ],
            })
        ).toThrow(/finding requires evidence/);
    });

    it('treats the catalog severity as authoritative for normalized findings', () => {
        const catalog = {
            categories: [
                { id: 'seo', title: 'SEO', file: '', guidance: '', rules: [{ id: 'seo/title', severity: 'medium' }] },
            ],
            ruleIds: ['seo/title'],
        } as never;
        const result = validateAuditResult(
            {
                ...base,
                evaluations: [
                    {
                        ruleId: 'seo/title',
                        disposition: 'finding',
                        title: 'Missing title',
                        severity: 'critical',
                        summary: 'Absent',
                        evidence: [{ type: 'manual', description: 'Reproduced' }],
                    },
                ],
            },
            catalog
        );
        expect(result.evaluations[0]?.severity).toBe('medium');
        const omitted = validateAuditResult(
            {
                ...base,
                evaluations: [
                    {
                        ruleId: 'seo/title',
                        disposition: 'finding',
                        title: 'Missing title',
                        summary: 'Absent',
                        evidence: [{ type: 'manual', description: 'Reproduced' }],
                    },
                ],
            },
            catalog
        );
        expect(omitted.evaluations[0]?.severity).toBe('medium');
    });

    it('rejects dangling evidence and derives guidance from findings, not gaps', () => {
        const catalog = {
            categories: [
                {
                    id: 'seo',
                    title: 'SEO',
                    file: '',
                    guidance: '',
                    rules: [
                        { id: 'seo/title', severity: 'high' },
                        { id: 'seo/meta', severity: 'critical' },
                    ],
                },
            ],
            ruleIds: ['seo/title', 'seo/meta'],
        } as never;
        const both = {
            ...base,
            catalog: {
                categories: [{ id: 'seo', title: 'SEO', ruleIds: ['seo/title', 'seo/meta'] }],
                ruleIds: ['seo/title', 'seo/meta'],
            },
        };
        expect(() =>
            validateAuditResult(
                {
                    ...both,
                    evaluations: [
                        {
                            ruleId: 'seo/title',
                            disposition: 'finding',
                            title: 'x',
                            severity: 'high',
                            summary: 'x',
                            evidence: [{ type: 'playhouse', page: 'missing', artifact: 'summary.json' }],
                        },
                    ],
                },
                catalog
            )
        ).toThrow(/Unknown Playhouse evidence page/);
        const unverified = validateAuditResult(
            {
                ...both,
                evaluations: [],
                coverage: [{ page: 'checkout', status: 'missing', note: 'x' }],
                summary: { guidance: 'no-go', narrative: 'kept' },
            },
            catalog
        );
        expect(unverified.summary).toEqual({ guidance: 'go', narrative: 'kept', highlights: [] });
        expect(unverified.evaluations.every((item) => item.disposition === 'not-verified')).toBe(true);
        expect(unverified.coverage.some((item) => 'ruleId' in item && item.ruleId)).toBe(false);
        const finding = (ruleId: string) => ({
            ruleId,
            disposition: 'finding',
            title: 'x',
            summary: 'x',
            evidence: [{ type: 'manual', description: 'x' }],
        });
        expect(validateAuditResult({ ...both, evaluations: [finding('seo/title')] }, catalog).summary?.guidance).toBe(
            'go-with-fixes'
        );
        expect(
            validateAuditResult({ ...both, evaluations: [finding('seo/title'), finding('seo/meta')] }, catalog).summary
                ?.guidance
        ).toBe('no-go');
        const lowered = validateAuditResult(
            {
                ...both,
                evaluations: [
                    { ...finding('seo/meta'), severity: 'low' },
                    { ...finding('seo/title'), severity: 'critical' },
                ],
            },
            catalog
        );
        // The rule severity is a ceiling an analysis can only lower.
        expect(lowered.evaluations.map((item) => item.severity)).toEqual(['low', 'high']);
        expect(lowered.summary?.guidance).toBe('go-with-fixes');
    });

    it('rejects an inconsistent catalog and unsafe source evidence paths', () => {
        expect(() =>
            validateAuditResult({ ...base, catalog: { categories: [], ruleIds: ['seo/title'] }, evaluations: [] })
        ).toThrow(/Catalog categories and ruleIds are inconsistent/);
        expect(() =>
            validateAuditResult(
                {
                    ...base,
                    evaluations: [
                        {
                            ruleId: 'seo/title',
                            disposition: 'not-verified',
                            title: 'x',
                            summary: 'x',
                            evidence: [{ type: 'source', file: '../secret' }],
                        },
                    ],
                },
                titleOnly
            )
        ).toThrow(/Unsafe source evidence file/);
    });

    it('rejects duplicate and unsafe page labels', () => {
        const page = {
            label: 'home',
            url: 'https://example.com',
            playhouse: { archiveDir: '/tmp/archive', version: '1', lighthouseVersion: '1', artifacts: {} },
        };
        expect(() => validateAuditResult({ ...base, pages: [page, page], evaluations: [] })).toThrow(
            /Duplicate page label/
        );
        expect(() =>
            validateAuditResult({ ...base, pages: [{ ...page, label: 'Home page' }], evaluations: [] })
        ).toThrow(/Invalid page label/);
    });

    it('validates the waterfall as an acyclic graph of known steps on captured pages', () => {
        const page = {
            label: 'pdp',
            url: 'https://example.com/p',
            playhouse: { archiveDir: '/tmp/archive', version: '1', lighthouseVersion: '1', artifacts: {} },
        };
        const ruleId = 'performance/server-request-waterfall';
        const catalog = {
            categories: [{ id: 'performance', title: 'Performance', ruleIds: [ruleId] }],
            ruleIds: [ruleId],
        };
        const step = (id: string, after: string[] = [], extra: object = {}) => ({
            id,
            kind: 'api',
            label: id,
            source: { file: 'src/routes/p.tsx', line: 3 },
            after,
            blocking: true,
            ...extra,
        });
        const withWaterfall = (steps: object[], overrides: object = {}) => ({
            ...base,
            catalog,
            pages: [page],
            evaluations: [
                {
                    ruleId,
                    disposition: 'not-verified',
                    title: 'Waterfall',
                    summary: 'x',
                    evidence: [],
                    waterfall: {
                        pages: [{ page: 'pdp', route: 'src/routes/p.tsx', summary: 'Bearer abc.def-ghi', steps }],
                    },
                    ...overrides,
                },
            ],
        });
        const result = validateAuditResult(
            withWaterfall([step('auth'), step('product', ['auth'], { note: 'see /Users/alice/x' })])
        );
        const entry = result.evaluations[0]?.waterfall?.pages[0];
        expect(entry?.steps[1]?.after[0]).toBe('auth');
        expect(JSON.stringify(entry)).not.toMatch(/abc\.def-ghi|\/Users\/alice/);
        expect(() => validateAuditResult(withWaterfall([step('a', ['missing'])]))).toThrow(
            /waits on unknown step: missing/
        );
        expect(() => validateAuditResult(withWaterfall([step('a', ['b']), step('b', ['a'])]))).toThrow(/has a cycle/);
        expect(() => validateAuditResult(withWaterfall([step('a'), step('a')]))).toThrow(/Duplicate waterfall step/);
        expect(() => validateAuditResult(withWaterfall([{ ...step('a'), source: { file: '../secret.ts' } }]))).toThrow(
            /Unsafe source evidence file/
        );
        expect(() => validateAuditResult(withWaterfall([step('a')], { ruleId: 'seo/title' }))).toThrow(
            /waterfall is only supported on performance\/server-request-waterfall/
        );
        expect(() =>
            validateAuditResult(withWaterfall([step('a', [], { opportunity: 'stream', critical: true })]))
        ).toThrow(/only suggest streaming when it is awaited and not critical/);
        expect(() =>
            validateAuditResult(withWaterfall([step('a', [], { opportunity: 'stream', blocking: false })]))
        ).toThrow(/only suggest streaming/);
        expect(() => validateAuditResult(withWaterfall([step('a', [], { opportunity: 'parallelize' })]))).toThrow(
            /suggests parallelize but waits on nothing/
        );
        expect(() =>
            validateAuditResult(
                withWaterfall([
                    step('a'),
                    step('b', ['a'], { opportunity: 'scapi-hook', critical: true }),
                    step('c', [], { opportunity: 'stream', critical: false }),
                ])
            )
        ).not.toThrow();
        const unknownPage = { ...withWaterfall([step('a')]), pages: [{ ...page, label: 'home' }] };
        expect(() => validateAuditResult(unknownPage)).toThrow(/Unknown waterfall page: pdp/);
    });
});

describe('central sanitization', () => {
    it('redacts URLs, bearer tokens, absolute paths, and analysis evidence', () => {
        const result = validateAuditResult(
            {
                ...base,
                pages: [
                    {
                        label: 'home',
                        url: 'https://user:pass@example.com/p?q=secret#fragment',
                        playhouse: {
                            archiveDir: '/private/tmp/audit/archive',
                            version: '1',
                            lighthouseVersion: '2',
                            artifacts: {
                                'diagnostics-mobile-cold.json': {
                                    console: [
                                        {
                                            text: 'access_token=diagnostic-secret',
                                            url: 'https://example.com/?token=artifact-secret',
                                        },
                                    ],
                                    nested: { path: '/Users/alice/diagnostic' },
                                },
                            },
                        },
                    },
                ],
                evaluations: [
                    {
                        ruleId: 'seo/title',
                        disposition: 'not-verified',
                        title: 'Bearer abc.def-ghi',
                        summary: 'See /Users/alice/private and https://example.com/?token=secret#x',
                        evidence: [
                            { type: 'source', file: 'src/app.ts', excerpt: 'Authorization: Bearer abc.def-ghi' },
                            {
                                type: 'playhouse',
                                page: 'home',
                                artifact: 'diagnostics-mobile-cold.json',
                                pointer: '/console/access_token=pointer-secret',
                                value: 'api_key=evidence-secret',
                            },
                        ],
                    },
                ],
            },
            titleOnly
        );
        const persisted = JSON.stringify(result);
        for (const secret of [
            'user',
            'pass',
            'secret',
            'fragment',
            'abc.def-ghi',
            'diagnostic-secret',
            'artifact-secret',
            'pointer-secret',
            'evidence-secret',
            '/Users/alice/private',
            '/Users/alice/diagnostic',
            '/private/tmp/audit/archive',
        ])
            expect(persisted).not.toMatch(new RegExp(escapeRegExp(secret)));
        expect(result.pages[0]?.url).toBe('https://example.com/p?q=%5BREDACTED%5D');
        expect(result.evaluations[0]?.evidence[1]).toMatchObject({ pointer: '/console/access_token=[REDACTED]' });
    });

    it('covers common secret names without redacting fractions', () => {
        const summary =
            'sessionid=deadbeef Set-Cookie: cookie-value api_signature=signed csrf_token=csrf credentials=creds ratios 16/9 and sm/md';
        const redacted = redact(summary);
        for (const secret of ['deadbeef', 'cookie-value', 'signed', 'csrf_token=csrf', 'credentials=creds'])
            expect(redacted).not.toMatch(new RegExp(secret));
        expect(redacted).toMatch(/16\/9 and sm\/md/);
    });

    it('keeps import aliases, which look like absolute paths', () => {
        expect(
            redact("import Header from '@/components/header/index' and '~/lib/utils', not /Users/alice/src/app.ts")
        ).toBe("import Header from '@/components/header/index' and '~/lib/utils', not [REDACTED_PATH].ts");
    });

    it('redacts complete quoted secrets containing spaces', () => {
        const redacted = redact(`password="correct horse battery staple" secret='multi word value'`);
        expect(redacted).not.toMatch(/correct horse|multi word/);
        expect(redacted).toMatch(/password="\[REDACTED\]" secret='\[REDACTED\]'/);
    });

    it.each([
        [
            '{"apiKey":"json-secret","clientSecret": "camel-secret"}',
            '{"apiKey":"[REDACTED]","clientSecret": "[REDACTED]"}',
        ],
        [String.raw`{\"accessToken\":\"escaped-secret\"}`, String.raw`{\"accessToken\":\"[REDACTED]\"}`],
        [
            "client_secret=s1 x-api-key: s2 slasPrivateClientSecret=s3 privateKey='s4'",
            "client_secret=[REDACTED] x-api-key: [REDACTED] slasPrivateClientSecret=[REDACTED] privateKey='[REDACTED]'",
        ],
        [
            'secretKey=s1 SECRET_KEY=s2 aws_secret_access_key=s3 tokenValue=s4 passwordHash=s5 apiKeyId=s6',
            'secretKey=[REDACTED] SECRET_KEY=[REDACTED] aws_secret_access_key=[REDACTED] tokenValue=[REDACTED] passwordHash=[REDACTED] apiKeyId=[REDACTED]',
        ],
        ['Authorization: Basic dXNlcjpwYXNz', 'Authorization: Basic [REDACTED]'],
        ['"authorization": "Bearer abc.def"', '"authorization": "Bearer [REDACTED]"'],
        [String.raw`password="a\"b" next`, 'password="[REDACTED]" next'],
        ['password="unclosed value', 'password=[REDACTED]'],
        ['"secret": ["s1", "s2"]', '"secret": [REDACTED]'],
        ['password=123456', 'password=[REDACTED]'],
    ])('redacts JSON, prefixed, suffixed and camelCase secret names: %s', (input, expected) => {
        expect(redact(input)).toBe(expected);
    });

    it('redacts known token formats under any name and inside URLs', () => {
        // Built from parts so secret scanners don't flag the fake tokens in this file.
        const fake = (...parts: string[]): string => parts.join('');
        const jwt = fake('eyJhbGciOi', 'JIUzI1NiJ9.', 'eyJzdWIiOi', 'IxMjM0In0.c2lnbmF0dXJl');
        const tokens = [
            jwt,
            fake('sk_', 'live_', 'FAKE0000000000000000'),
            fake('whsec_', 'FAKE0000000000000000'),
            fake('ghp_', 'FAKE0000000000000000000000000000'),
            fake('github_', 'pat_', 'FAKE0000000000000000000000'),
            fake('npm_', 'FAKE00000000000000000000000000000000'),
            fake('xoxb', '-0000000000-FAKEFAKEFAKE'),
            fake('xapp', '-1-FAKE0000000000'),
            fake('sk-', 'ant-', 'FAKE0000000000000000000000'),
            fake('sk-', 'proj-', 'FAKE0000000000000000000000'),
            fake('AKIA', 'FAKE0000FAKE0000'),
            fake('-----BEGIN PRIVATE KEY-----\nFAKE', '\n-----END PRIVATE KEY-----'),
            fake('-----BEGIN RSA PRIVATE KEY-----\nMIIEFAKE', 'FAKEFAKEFAKEFAKE'),
        ];
        expect(redact(`reviews.config.value ${tokens.join(' and ')}.`)).toBe(
            `reviews.config.value ${tokens.map(() => '[REDACTED]').join(' and ')}.`
        );
        expect(
            redact(
                `See https://example.com/callback/${jwt} and ${fake('https://hooks.slack.com/services/', 'T0000/B0000/FAKE')}`
            )
        ).toBe('See https://example.com/callback/[REDACTED] and https://hooks.slack.com/services/[REDACTED]');
        const kept = 'public: pk_live_51H8 and the SLAS client id 1d763261-6522-4913-9d52-5d947d3b94c4';
        expect(redact(kept)).toBe(kept);
    });

    it.each([
        ['x-api-key: 8472619305123456 x-auth-token: 1234567890', 'x-api-key: [REDACTED] x-auth-token: [REDACTED]'],
        ['password=[REDACTED]abc123 next', 'password=[REDACTED] next'],
        ['secret="[REDACTED] leak here" next', 'secret="[REDACTED]" next'],
        [`password="${'x'.repeat(5000)}" next`, 'password="[REDACTED]" next'],
        [`secret: [${'"x",'.repeat(2000)}"y"] next`, 'secret: [REDACTED] next'],
        ['secret: [["a","b"],["c"]] next', 'secret: [REDACTED] next'],
        [
            '{"x-api-key":"123456789","password": "true","credentials": {"user":"u","pass":"p"},"ok":1}',
            '{"x-api-key":"[REDACTED]","password": "true","credentials": [REDACTED],"ok":1}',
        ],
        ['Authorization: "Basic dXNlcjpwYXNz"', 'Authorization: "Basic [REDACTED]"'],
    ])('reads each value once and keeps only an exact placeholder: %#', (input, expected) => {
        expect(redact(input)).toBe(expected);
    });

    it('redacts private keys from BEGIN to END and leaves prose after a lone header', () => {
        const fake = (...parts: string[]): string => parts.join('');
        const begin = fake('-----BEGIN RSA ', 'PRIVATE KEY-----');
        const end = fake('-----END RSA ', 'PRIVATE KEY-----');
        const body =
            'Proc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,0123456789ABCDEF\n\nMIIEFAKEFAKEFAKEFAKEFAKE\nFAKEFAKEFAKEFAKE==';
        expect(redact(`key ${begin}\n${body}\n${end} rotated`)).toBe('key [REDACTED] rotated');
        expect(redact(`key ${begin}\n${body}`)).toBe('key [REDACTED]');
        expect(redact(`"key": "${begin}\\n${body.replaceAll('\n', '\\n')}"`)).toBe('"key": "[REDACTED]"');
        expect(redact(`Found ${begin} in config.js, rotate it`)).toBe('Found [REDACTED] in config.js, rotate it');
        expect(redact(`${begin}\nMIIEFAKEFAKEFAKEFAKEFAKE\nThe key above is truncated. ${end}`)).toBe('[REDACTED]');
        expect(
            redact(
                `${begin}\nMIIEFAKEFAKEFAKEFAKEFAKE\nThe key above is truncated.\n${begin}\nFAKEFAKEFAKEFAKEFAKE\n${end}`
            )
        ).toBe('[REDACTED]\nThe key above is truncated.\n[REDACTED]');
    });

    it('keeps hostnames that start like a token', () => {
        const text =
            'See https://xapp-design-system.example.com/x and https://sk-ant-design-system-documentation.example.com/y';
        expect(redact(text)).toBe(text);
    });

    it('keeps values that cannot be secrets and words that contain a secret name', () => {
        const summary =
            'hasPassword: true, isSecret: false, showPassword=false, pageToken=2, cookie=null, tokens: 5, maxTokens: 4096, secretariat=open, passwordless login, tokenCount=3, cookie-consent: accepted';
        expect(redact(summary)).toBe(summary);
    });

    it('stays linear on long unclosed values', () => {
        for (const unit of [
            '-----BEGIN PRIVATE KEY-----',
            '-----BEGIN PRIVATE KEY-----\n',
            'password="',
            '"password":"',
            'secret: [',
            '{"token":{',
            'eyJ-',
            'xapp-',
            'a-',
        ]) {
            const input = unit.repeat(Math.ceil(1_000_000 / unit.length));
            const started = performance.now();
            redact(input);
            // Quadratic matching takes seconds on 1 MB; linear matching takes a fraction of one.
            expect(performance.now() - started, unit).toBeLessThan(3000);
        }
    });

    it('keeps workspace-relative paths so errors can name the file', () => {
        expect(redact('See ai-analysis/categories/seo/rules/title.json and /Users/alice/x.json')).toBe(
            'See ai-analysis/categories/seo/rules/title.json and [REDACTED_PATH].json'
        );
    });
});

describe('validateRecommendations', () => {
    it('requires each AI recommendation to name a candidate or package of each page, and takes its bytes', async () => {
        const { outputs, page } = await fixture();
        const bundle = await analyzeBundle(outputs, [page], new PlayhouseArtifactReader([page]));
        const local = bundle.pages[0]?.local;
        const bigLib = local?.packages.find((owner) => owner.name === 'big-lib');
        const evaluation = (recommendations: object[], ruleId = 'performance/reduce-javascript-on-load') =>
            ({
                ruleId,
                disposition: 'finding',
                title: 't',
                summary: 's',
                evidence: [],
                recommendations,
            }) as never as Parameters<typeof validateRecommendations>[0];
        const shared = {
            pages: ['home'],
            title: 'Load the drawer when it opens',
            how: 'Render it with React.lazy once open.',
            files: [{ file: 'src/routes/_app.tsx' }],
        };
        const drawer = {
            ...shared,
            change: 'lazy-component',
            trigger: 'interaction',
            target: 'src/components/drawer/index.tsx',
        };
        const accepted = evaluation([
            drawer,
            {
                ...shared,
                change: 'dynamic-import',
                trigger: 'interaction',
                target: 'big-lib',
                files: [{ file: 'src/components/drawer/inner.tsx', line: 1 }],
            },
            { ...shared, change: 'replace', target: 'big-lib' },
        ]);
        validateRecommendations(accepted, new Set(['home']), bundle);
        const [lazy, deferred, replaced] = accepted.recommendations ?? [];
        expect([lazy?.savings, lazy?.files[0]?.line]).toEqual([
            [{ page: 'home', bytes: local?.candidates[0]?.savedBytes, upTo: false }],
            3,
        ]);
        expect(deferred?.savings).toEqual([{ page: 'home', bytes: bigLib?.deferrableBytes, upTo: false }]);
        expect(replaced?.savings).toEqual([{ page: 'home', bytes: bigLib?.bytes, upTo: true }]);

        const fails = (items: object[], pattern: RegExp, ruleId?: string) =>
            expect(() => validateRecommendations(evaluation(items, ruleId), new Set(['home']), bundle)).toThrow(
                pattern
            );
        fails([{ ...drawer, target: 'src/components/made-up.tsx' }], /is not a candidate or package of home/);
        fails([{ ...drawer, target: 'Module glue' }], /is not a candidate or package of home/);
        fails(
            [{ ...drawer, target: 'src/components/header/index.tsx' }],
            /saves at most 11 KiB on its pages, below the 30 KiB worth recommending/
        );
        fails([{ ...drawer, pages: ['pdp'] }], /Unknown recommendation page: pdp/);
        fails([drawer, drawer], /Duplicate recommendation/);
        fails([{ ...drawer, trigger: undefined }], /needs a trigger/);
        fails([{ ...drawer, change: 'remove' }], /takes no trigger/);
        fails([{ ...drawer, files: [{ file: '../outside.ts' }] }], /Unsafe source evidence file/);
        fails([drawer], /only supported on/, 'performance/tbt-budget');
    });
});
