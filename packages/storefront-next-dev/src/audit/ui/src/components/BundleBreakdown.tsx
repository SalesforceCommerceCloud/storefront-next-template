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
import type { AuditResult, Recommendation } from '../types';
import { formatBytes } from '../lib/format';
import { forRun } from '../lib/run';
import { Icon } from '../lib/slds';
import { share, toneClass } from '../lib/tone';
import { cn } from '../lib/cn';
import { withCode } from '../lib/text';
import { AiBadge } from './AiBadge';
import { MetricStat } from './MetricStat';
import { Notice } from './Notice';

type Bundle = NonNullable<AuditResult['bundle']>;
type BundlePage = Bundle['pages'][number];
type LocalPage = NonNullable<BundlePage['local']>;
type Owner = LocalPage['packages'][number];

/** Kept in step with the rule scripts and src/bundle/schema.ts (runtime values the UI can't import). */
export const RECOMMENDATIONS_RULE_ID = 'performance/reduce-javascript-on-load';
const SCHEMA_VERSION = 2;
const BUDGET_BYTES = 1_400_000; // performance/javascript-size
const OWNERS_SHOWN = 12;
const CHUNKS_SHOWN = 10;
const CANDIDATES_SHOWN = 6;

/** The budget is in decimal megabytes, as the rule states it. */
const megabytes = (bytes: number): string => `${(bytes / 1_000_000).toFixed(2)} MB`;

const KIND_LABEL: Record<Owner['kind'], string> = {
    npm: 'package',
    project: 'project code',
    build: 'added by the bundler',
};
const CHANGE_LABEL: Record<Recommendation['change'], string> = {
    'lazy-component': 'Load the component later',
    'dynamic-import': "Import it when it's needed",
    'narrower-import': 'Import less of it',
    replace: 'Replace it',
    remove: 'Remove it from the client',
};
const TRIGGER_LABEL: Record<NonNullable<Recommendation['trigger']>, string> = {
    interaction: 'on interaction',
    visible: 'when it scrolls into view',
    navigation: 'with the route that uses it',
    idle: 'after load, when the browser is idle',
};

/**
 * The page's first-party JavaScript in three parts that never mix their sources: what the live site downloaded
 * (measured), what the page's routes load in a local build of the project folder (deterministic), and the AI's
 * recommendations, grounded in that local build.
 */
export function BundleBreakdown({ result, label }: { result: AuditResult; label: string }) {
    const bundle = result.bundle;
    if (bundle && bundle.schemaVersion !== SCHEMA_VERSION) {
        return (
            <div className="slds-p-around_medium">
                <Notice>
                    <strong>This run&apos;s bundle analysis is from an earlier version of the audit.</strong> Run the
                    audit again to see it.
                </Notice>
            </div>
        );
    }
    const page = bundle?.pages.find((entry) => entry.page === label);
    if (!bundle || !page) {
        const skipped = bundle?.skipped.find((entry) => entry.page === label);
        return (
            <div className="slds-p-around_medium">
                <Notice>
                    <strong>No bundle analysis for this page.</strong>{' '}
                    {skipped?.reason ??
                        (bundle
                            ? "The run's bundle analysis doesn't include this page."
                            : 'This run has no bundle analysis; runs prepared before it was added have none.')}
                </Notice>
            </div>
        );
    }

    return (
        <div className="slds-p-around_medium audit-stack">
            <LiveSection page={page} />
            <LocalSection bundle={bundle} page={page} />
            <Recommendations result={result} page={page} />
        </div>
    );
}

function LiveSection({ page }: { page: BundlePage }) {
    const { live } = page;
    return (
        <section aria-labelledby="bundle-live">
            <h3 id="bundle-live" className="slds-text-heading_small">
                Measured on the live site{' '}
                <span className="slds-text-body_small slds-text-color_weak">
                    first-party JavaScript · mobile · cold cache
                </span>
            </h3>
            <p className="slds-text-body_small slds-text-color_weak audit-prose slds-m-bottom_small">
                Everything the storefront serves from its own bundle path (/mobify/bundle/), npm packages included, as
                the browser downloaded it. Tags such as analytics and pixels aren&apos;t counted.
            </p>
            <div className="audit-metric-row">
                <MetricStat
                    label="JavaScript size"
                    value={megabytes(live.decodedBytes)}
                    ok={live.decodedBytes <= BUDGET_BYTES}
                    detail={`budget ${megabytes(BUDGET_BYTES)}, uncompressed`}
                    className="audit-metric-row__item"
                />
                <MetricStat
                    label="Transferred"
                    value={formatBytes(live.transferBytes)}
                    detail="compressed, over the network"
                    className="audit-metric-row__item"
                />
                <MetricStat
                    label="Scripts"
                    value={String(live.scripts)}
                    detail={
                        live.beforeLoad === live.scripts
                            ? 'all before the load event'
                            : `${live.beforeLoad} before the load event`
                    }
                    className="audit-metric-row__item"
                />
            </div>
        </section>
    );
}

function LocalSection({ bundle, page }: { bundle: Bundle; page: BundlePage }) {
    const visualizer = bundle.build?.visualizer ? forRun('/api/bundle/visualizer') : undefined;
    const local = page.local;
    const leaf = page.route?.ids.at(-1);
    let missing: string | undefined;
    if (!local) {
        missing =
            bundle.status === 'unavailable'
                ? "The project wasn't built, so there is no local analysis for this page. The notes above say why."
                : "This page's route wasn't found in the local build, so there is no local analysis for it.";
    }

    return (
        <section className="slds-border_top slds-p-top_medium audit-stack" aria-labelledby="bundle-local">
            <div>
                <div className="slds-grid slds-grid_vertical-align-center slds-grid_align-spread audit-gap_small">
                    <h3 id="bundle-local" className="slds-text-heading_small">
                        Local build analysis
                    </h3>
                    {visualizer ? (
                        <a
                            className="slds-button slds-button_neutral"
                            href={visualizer}
                            target="_blank"
                            rel="noreferrer">
                            Open bundle visualizer
                            <Icon
                                category="utility"
                                name="new_window"
                                size="xx-small"
                                className="slds-button__icon slds-button__icon_right"
                            />
                        </a>
                    ) : null}
                </div>
                <p className="slds-text-body_regular audit-prose slds-m-top_x-small">
                    Everything from here down comes from building the project folder on this machine, not from the live
                    site. The live site may run other code, so these numbers won&apos;t match the measurements above
                    exactly.
                    {leaf ? (
                        <>
                            {' '}
                            The page is matched to the build by its route,{' '}
                            <span className="slds-text-font_monospace">{leaf}</span>
                            {page.route?.source === 'url' ? ', found from its URL.' : '.'}
                        </>
                    ) : null}
                </p>
            </div>

            {bundle.notes.length ? (
                <Notice>
                    {bundle.status === 'complete' ? null : (
                        <p>
                            <strong>The local build analysis is incomplete.</strong> The live measurements above
                            aren&apos;t affected.
                        </p>
                    )}
                    <ul className="slds-list_dotted">
                        {bundle.notes.map((note) => (
                            <li key={note}>{note}</li>
                        ))}
                    </ul>
                </Notice>
            ) : null}

            {missing || !local ? (
                <p className="slds-text-color_weak">{missing}</p>
            ) : (
                <>
                    <div className="audit-metric-row">
                        <MetricStat
                            label="Loaded up front"
                            value={megabytes(local.bytes)}
                            detail="minified, uncompressed"
                            className="audit-metric-row__item"
                        />
                        <MetricStat
                            label="Chunks"
                            value={String(local.chunks)}
                            detail="the entry, the page's routes and their static imports"
                            className="audit-metric-row__item"
                        />
                    </div>

                    <div className="slds-grid slds-wrap slds-gutters">
                        <section
                            className="slds-col slds-size_1-of-1 slds-large-size_1-of-2"
                            aria-labelledby="bundle-owners">
                            <h4 id="bundle-owners" className="slds-text-title_bold slds-m-bottom_small">
                                What it&apos;s made of
                            </h4>
                            <SizeList
                                items={local.packages.slice(0, OWNERS_SHOWN).map((owner) => ({
                                    key: owner.name,
                                    name: owner.name,
                                    bytes: owner.bytes,
                                    detail: [
                                        KIND_LABEL[owner.kind],
                                        owner.versions ? `${owner.versions.length} versions bundled` : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' · '),
                                }))}
                            />
                        </section>
                        <section
                            className="slds-col slds-size_1-of-1 slds-large-size_1-of-2"
                            aria-labelledby="bundle-chunks">
                            <h4 id="bundle-chunks" className="slds-text-title_bold slds-m-bottom_small">
                                Largest chunks
                            </h4>
                            <SizeList
                                items={local.largest.slice(0, CHUNKS_SHOWN).map((chunk) => ({
                                    key: chunk.file,
                                    name: chunk.file,
                                    bytes: chunk.bytes,
                                    detail: chunk.owners.map((owner) => owner.name).join(', '),
                                }))}
                            />
                        </section>
                    </div>

                    <Candidates local={local} graph={bundle.status === 'complete'} />
                </>
            )}
        </section>
    );
}

/** The static imports that pull the most code in: the facts the recommendations start from, not suggestions. */
function Candidates({ local, graph }: { local: LocalPage; graph: boolean }) {
    return (
        <section aria-labelledby="bundle-candidates">
            <h4 id="bundle-candidates" className="slds-text-title_bold">
                Imports that pull in the most code
            </h4>
            <p className="slds-text-body_small slds-text-color_weak audit-prose">
                Static imports in project code, by how much less the page would load up front if each one loaded later.
                Whether that&apos;s possible depends on when the page needs the code; see the recommendations below.
            </p>
            {!graph ? (
                <p className="slds-text-color_weak slds-m-top_small">
                    Tracing imports needs the build&apos;s module graph; see the notes above.
                </p>
            ) : !local.candidates.length ? (
                <p className="slds-text-color_weak slds-m-top_small">
                    No single import in the project pulls 10 KB or more into this page.
                </p>
            ) : (
                <ul className="audit-suggestions">
                    {local.candidates.slice(0, CANDIDATES_SHOWN).map((item) => (
                        <li key={`${item.importer.file}\n${item.target}`} className="audit-suggestions__item">
                            <div className="audit-suggestions__body">
                                <div className="slds-text-body_regular">
                                    <span className="slds-text-font_monospace">{item.target}</span>
                                    <span className="slds-text-color_weak"> · {formatBytes(item.savedBytes)}</span>
                                </div>
                                <div className="slds-text-body_small slds-text-color_weak">
                                    imported by{' '}
                                    <span className="slds-text-font_monospace">
                                        {item.importer.file}
                                        {item.importer.line ? `:${item.importer.line}` : null}
                                    </span>
                                    {item.lazyElsewhere ? (
                                        <>
                                            {' '}
                                            · already loaded lazily in{' '}
                                            <span className="slds-text-font_monospace">
                                                {item.lazyElsewhere.join(', ')}
                                            </span>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function SizeList({ items }: { items: Array<{ key: string; name: string; bytes: number; detail?: string }> }) {
    const largest = items[0]?.bytes ?? 0;
    return (
        <ul className="slds-list_vertical-space">
            {items.map((item) => (
                <li key={item.key} className="slds-item">
                    <div className="slds-grid slds-grid_align-spread audit-gap_small slds-text-body_small">
                        <span className="slds-truncate slds-text-font_monospace" title={item.name}>
                            {item.name}
                        </span>
                        <span className="slds-no-flex slds-text-font_monospace slds-text-color_weak">
                            {formatBytes(item.bytes)}
                        </span>
                    </div>
                    <div className="audit-meter audit-meter_thin slds-m-top_xx-small">
                        <div
                            className={cn('audit-meter__fill', toneClass('info'))}
                            style={share(largest ? item.bytes / largest : 0)}
                        />
                    </div>
                    {item.detail ? (
                        <div className="slds-text-body_small slds-text-color_weak slds-truncate">{item.detail}</div>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}

/** The AI's recommendations for this page, with the savings finalize measured on the local build. */
function Recommendations({ result, page }: { result: AuditResult; page: BundlePage }) {
    const evaluation = result.evaluations.find((item) => item.ruleId === RECOMMENDATIONS_RULE_ID);
    const items = (evaluation?.recommendations ?? []).filter((item) => item.pages.includes(page.page));
    const saving = (item: Recommendation) => item.savings?.find((entry) => entry.page === page.page);
    // The import statement, under the file entry for its own line only.
    const excerpt = (file: Recommendation['files'][number], target: string) => {
        const importer = page.local?.candidates.find(
            (item) => item.importer.file === file.file && item.target === target
        )?.importer;
        return importer && (file.line ?? importer.line) === importer.line ? importer.excerpt : undefined;
    };

    let empty: string | undefined;
    if (!items.length) {
        empty = !evaluation
            ? 'This run has no AI review of the local build.'
            : evaluation.disposition === 'not-verified' || evaluation.disposition === 'pass'
              ? evaluation.summary
              : 'The AI made no recommendations for this page.';
    }

    return (
        <section className="slds-border_top slds-p-top_medium" aria-labelledby="bundle-recommendations">
            <div className="slds-grid slds-grid_vertical-align-center audit-gap_small">
                <h3 id="bundle-recommendations" className="slds-text-heading_small">
                    Recommendations
                </h3>
                <AiBadge>AI recommendations</AiBadge>
            </div>
            <p className="slds-text-body_small slds-text-color_weak audit-prose slds-m-top_x-small">
                Written by an AI agent that traced the local build&apos;s imports into the project source to find code
                this page loads up front but needs only later. Savings are measured on the local build (&quot;up
                to&quot; when part of the code stays). Review each one before you make it: they&apos;re options to
                consider, not required fixes.
            </p>
            {empty ? (
                <p className="slds-text-color_weak slds-m-top_small">{empty}</p>
            ) : (
                <ol className="audit-suggestions">
                    {items.map((item, index) => {
                        const saved = saving(item);
                        return (
                            <li key={`${item.change}\n${item.target}`} className="audit-suggestions__item">
                                <span className="audit-waterfall__marker">{index + 1}</span>
                                <div className="audit-suggestions__body">
                                    <div className="slds-text-body_regular">
                                        <strong>{item.title}</strong>
                                    </div>
                                    <div className="slds-text-body_small slds-text-color_weak">
                                        {CHANGE_LABEL[item.change]}
                                        {item.trigger ? ` ${TRIGGER_LABEL[item.trigger]}` : null}
                                        {saved
                                            ? ` · ${saved.upTo ? 'up to ' : ''}${formatBytes(saved.bytes)} less up front`
                                            : null}
                                        {' · '}
                                        <span className="slds-text-font_monospace">{item.target}</span>
                                    </div>
                                    <p className="slds-text-body_regular audit-prose">{withCode(item.how)}</p>
                                    {item.files.map((file) => (
                                        <div key={`${file.file}:${file.line ?? ''}`}>
                                            <span className="slds-text-body_small slds-text-font_monospace">
                                                {file.file}
                                                {file.line ? `:${file.line}` : null}
                                            </span>
                                            {excerpt(file, item.target) ? (
                                                <code className="audit-code slds-show">
                                                    {excerpt(file, item.target)}
                                                </code>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
