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

/**
 * Verifies the content and format of a file's leading comment block.
 *
 * Faithful port of `eslint-plugin-headers`'s `header-format` rule, scoped to the
 * configuration this repo actually uses: `{ source: 'string', content: <header> }`
 * with the default `jsdoc` style and `preservePragmas: true`. The `content`
 * option is supplied from `.oxlintrc.json` — same single source of truth the
 * ESLint config used (`APACHE_LICENSE_HEADER`) — so there is zero drift.
 *
 * Unsupported upstream options (`source: 'file'`, `patterns`, `variables`,
 * `trailingNewlines`, `enableVueSupport`, `style: 'line'`) are intentionally
 * omitted: none are used by this codebase. If one is ever needed, port the
 * corresponding branch from the upstream rule.
 */

/** Replaces CRLF/CR with LF, matching upstream `normalizeEol`. */
function normalizeEol(str: string): string {
    return str.replaceAll(/\r\n|\r/g, '\n');
}

/** Escapes regex metacharacters, matching upstream `escapeRegex`. */
function escapeRegex(s: string): string {
    return `${s}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Detects the source EOL; defaults to `\n` (repo enforces LF). */
function getEolCharacter(code: string): string {
    const match = /\r\n|\r|\n/.exec(code);
    return match?.[0] || '\n';
}

/**
 * Builds the leading `/*` comment body for the fixer, matching
 * `CommentFormatter#getJsdoc` for the default jsdoc format.
 */
function formatJsdoc(lines: string[], eol: string): string {
    const blockPrefix = `*${eol}`;
    const blockSuffix = `${eol} `;
    const linePrefix = ' * ';
    const body = lines.map((line) => `${linePrefix}${line}`.trimEnd()).join(eol);
    return `/*${blockPrefix}${body}${blockSuffix}*/`;
}

/**
 * Tests whether the leading comment's content matches the expected header,
 * replicating `CommentBlockMatcher` for the jsdoc format (no patterns).
 */
function matchesHeader(commentValue: string, expectedLines: string[], eol: string): boolean {
    const blockPrefix = `*${eol}`;
    const blockSuffix = `${eol} `;
    const linePrefix = ' * ';

    const bodyPattern = expectedLines
        .map((line) => `${escapeRegex(linePrefix)}${escapeRegex(line)}`.trimEnd())
        .join('\n');
    const prefixedBodyRegex = new RegExp(`^${escapeRegex(blockPrefix)}${bodyPattern}`);
    const suffixRegex = new RegExp(`${escapeRegex(blockSuffix)}$`);

    const actual = normalizeEol(commentValue);
    return prefixedBodyRegex.test(actual) && suffixRegex.test(actual);
}

export const headerFormatRule = {
    meta: {
        type: 'layout',
        docs: {
            description: "Verifies the content and format of a file's leading comment block.",
            recommended: false,
        },
        messages: {
            missingHeader: 'No header found.',
            headerContentMismatch: 'Header does not include expected content.',
        },
        fixable: 'code',
        schema: [
            {
                type: 'object',
                properties: {
                    source: { enum: ['string'] },
                    content: { type: 'string' },
                },
                required: ['source', 'content'],
            },
        ],
    },

    create(context) {
        const options = context.options?.[0] ?? {};
        const configuredHeaderContent: string = options.content ?? '';
        const expectedHeaderLines = normalizeEol(configuredHeaderContent).split('\n');
        const sourceEol = getEolCharacter(context.sourceCode.getText());

        return {
            Program(node) {
                // hasHeaderComment: at least one leading comment, ignoring a lone shebang.
                const leading = context.sourceCode.getCommentsBefore(node);
                const allComments = context.sourceCode.getAllComments();
                const hasHeader = leading.length > 0 && !(leading.length === 1 && leading[0].type === 'Shebang');

                if (!hasHeader) {
                    const insertionPoint = node.body[0] || node;
                    context.report({
                        node: insertionPoint,
                        messageId: 'missingHeader',
                        fix(fixer) {
                            // Upstream appends `trailingNewlines ?? 1` EOLs after the block.
                            return fixer.insertTextBefore(
                                insertionPoint,
                                `${formatJsdoc(expectedHeaderLines, sourceEol)}${sourceEol}`
                            );
                        },
                    });
                    return;
                }

                // getHeaderComments: a leading Block comment stands alone; otherwise
                // join the run of consecutive Line comments. Skip a leading shebang.
                const startingIndex = allComments[0]?.type === 'Shebang' ? 1 : 0;
                const first = allComments[startingIndex];
                let headerComments;
                if (first.type === 'Block') {
                    headerComments = [first];
                } else {
                    headerComments = [first];
                    const text = context.sourceCode.getText();
                    for (let i = startingIndex + 1; i < allComments.length; i += 1) {
                        const between = text.slice(allComments[i - 1].range[1], allComments[i].range[0]);
                        if (!/^(\r\n|\r|\n)$/.test(between) || allComments[i].type !== 'Line') {
                            break;
                        }
                        headerComments.push(allComments[i]);
                    }
                }

                const isBlock = first.type === 'Block';
                const headerCommentLines = isBlock
                    ? headerComments[0].value.split(sourceEol)
                    : headerComments.map((c) => c.value);
                const commentValue = isBlock ? headerComments[0].value : headerComments.map((c) => c.value).join('\n');

                if (matchesHeader(commentValue, expectedHeaderLines, sourceEol)) {
                    return;
                }

                // preservePragmas (jsdoc, default true): keep trailing @pragma lines
                // when rewriting the header.
                const headerPragmas = headerCommentLines
                    .map((line) => {
                        const m = line.match(/^[^\w]*(@\w.*)$/);
                        return m ? m[1] : undefined;
                    })
                    .filter((x): x is string => Boolean(x));

                const fixerLines =
                    headerPragmas.length > 0 ? expectedHeaderLines.concat(['', ...headerPragmas]) : expectedHeaderLines;

                context.report({
                    loc: {
                        start: headerComments[0].loc.start,
                        end: headerComments[headerComments.length - 1].loc.end,
                    },
                    messageId: 'headerContentMismatch',
                    fix(fixer) {
                        return fixer.replaceTextRange(
                            [headerComments[0].range[0], headerComments[headerComments.length - 1].range[1]],
                            formatJsdoc(fixerLines, sourceEol)
                        );
                    },
                });
            },
        };
    },
};
