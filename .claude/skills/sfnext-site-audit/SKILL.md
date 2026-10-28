---
name: sfnext-site-audit
description: >-
  Run a pre-launch site audit of a Storefront Next storefront with `sfnext audit`: measure the deployed home,
  category (PLP) and product (PDP) pages with Playhouse (Lighthouse), break down the JavaScript bundle, check
  performance, SEO, security and best-practice rules (scripts decide some, you evaluate the rest), and
  report launch readiness in a live local dashboard. Use when asked to "audit my storefront", "run a site audit",
  "pre-launch check", "go-live check", "launch readiness", or "is my storefront ready to launch". Needs
  `@salesforce/storefront-next-dev` 1.4.1 or later in the project.
---

# Storefront Next Site Audit

The audit is a CLI workflow that you drive. `sfnext audit prepare` collects the evidence and decides every rule that a script can decide. You (and your subagents) evaluate the remaining rules and write one small JSON file per rule. `sfnext audit finalize` validates your files and compiles the report. A local dashboard shows progress the whole time and serves the final report.

```text
check prerequisites → find the pages → serve (background) → install + prepare (15–30 min)
  → evaluate AI rules in parallel batches → write summary.json → finalize → review with the user
```

A full audit of three pages takes about 30 minutes. Tell the user that before you start.

## Ground rules

- **The project is read-only.** The only changes allowed are installing its dependencies (step 3) and the gitignored `build/` folder that `prepare` rewrites. Don't fix findings during the audit; offer to fix them afterwards.
- **In the project, write only inside the audit workspace**, `<project>/.site-audit/` (command logs go in the system temp directory). Never commit the workspace: it holds measured page data.
- **Never record secrets**: no cookies, authorization headers, tokens or response bodies in any file you write.
- **Run every command from the project root.** All `sfnext audit` commands then default to the project and to `.site-audit/`, so the commands below need no `-d` or `--workspace` flags.
- Use `pnpm exec sfnext audit …`, which runs the project's own SDK version. `b2c sfnext audit …` is equivalent: run inside the project, the b2c CLI loads the project's installed SDK, so the same version requirement applies.

## 1. Check prerequisites

1. **Storefront Next project.** `package.json` lists `@salesforce/storefront-next-dev`. If it doesn't, stop and tell the user this skill only audits Storefront Next storefronts.
2. **SDK version.** The `sfnext audit` commands ship in `@salesforce/storefront-next-dev` **1.4.1** and later. Check:

   ```bash
   pnpm exec sfnext audit prepare --help
   ```

   The five audit commands are `prepare`, `serve`, `progress`, `finalize` and `catalog`. They are intentionally hidden from the parent `sfnext audit --help` and top-level `sfnext --help` lists, so use `prepare --help` as the availability check. If it prints `Command audit:prepare not found`, or `pnpm exec sfnext --version` reports an older version, stop and tell the user the audit needs `@salesforce/storefront-next-dev` 1.4.1 or later. Upgrading changes `package.json` and the lockfile and can bring other SDK changes, so it is the user's decision: point them to `docs/COMPATIBILITY.md` in the project, and run an upgrade only if they ask you to. If `node_modules` is missing, run step 3's install first and check again.
3. **Workspace ignored by git.** Run `git check-ignore -q .site-audit`. If it isn't ignored (projects created before 1.4.1), tell the user to add `.site-audit/` to `.gitignore`; don't edit it yourself.

## 2. Find the pages

The audit measures three pages of the deployed storefront over HTTPS: the **home page (`home`)**, a **category listing page (`plp`)** and a **product page (`pdp`)**. It doesn't measure a local dev server. Users usually give only the storefront's address. Treat that address as the home page and find the other two pages yourself. If the user does give a page URL, use it. If the user has no deployed storefront yet, stop: the audit needs one.

Check every URL you'll use with:

```bash
curl -sL -o /dev/null -w '%{http_code} %{url_effective}\n' <url>
```

Expect `200` and a final URL on the same host, and use that final URL in the audit: product links often redirect to their canonical address. A redirect to a login, password or maintenance page also returns `200`, so look at the final URL too.

1. **Home.** Check the address the user gave.
2. **PLP.** List the home page's links, most repeated first. The navigation's category links are usually among them:

   ```bash
   curl -sL <home url> | grep -oE '<a [^>]*href="[^"#?]*"' | grep -oE 'href="[^"]*"$' | sort | uniq -c | sort -rn | head -40
   ```

   Skip links to other hosts, files, account, cart, search and content pages. Then try likely category links one at a time. A Storefront Next category page embeds its product list as structured data. This prints the number of products in it, or nothing if the page has none:

   ```bash
   curl -sL <candidate url> | sed -n 's/.*<script id="category-schema"[^>]*>\([^<]*\)<\/script>.*/\1/p' | jq '.mainEntity.numberOfItems'
   ```

   Use the first candidate that lists several products.
3. **PDP.** Take an in-stock product from that category's list:

   ```bash
   curl -sL <plp url> | sed -n 's/.*<script id="category-schema"[^>]*>\([^<]*\)<\/script>.*/\1/p' | jq -r '.mainEntity.itemListElement[].item | select((.offers.availability // "") | test("InStock")) | .url' | head -3
   ```

   Check it, then confirm it's a product page: `curl -sL <final url> | grep -c 'id="product-schema"'` prints `1` or more.

If a page has no structured data (a customized storefront can remove it), use the links instead. With the default URL format, category paths contain `/c/` and product paths contain `/p/`. Open a candidate and judge from its content. If you still can't find a working page, ask the user for that one URL. Never make up URLs.

Then tell the user, in a few lines:
- the three URLs you'll audit (they can swap any of them);
- about 5 minutes of measurement per page;
- a build of the project (it runs the project's `build` script twice and rewrites the gitignored `build/` folder);
- on the first audit on this machine, a one-time download of about 180 MB for Playwright's Chromium.

Only these options change what is collected. Use them only when the user asks:

| User asks for | Flag |
|---|---|
| More accurate, less noisy performance data | `--runs 3`. Collection time grows with the run count, so confirm the user accepts that before you add it. Never raise it on your own. |
| No build of the project | `--no-build`. The bundle rules are then reported as not verified. |
| A non-HTTPS URL (for example a staging host) | `--allow-http` |
| Other or extra pages | Repeat `--url <label>=<url>`, and `--expected-page <label>` for each label the audit should cover (default `home`, `plp`, `pdp`). |

## 3. Start the dashboard, then prepare

Start the dashboard first so the user can watch collection. Run it as a background job, with its output going to a log file outside the project (for example in the system temp directory), and keep it running until the user is done reviewing:

```bash
pnpm exec sfnext audit serve
```

It opens the dashboard in the user's browser. Read the local URL it prints from the log (default `http://localhost:8787`). If the job exits at once because the port is taken, start it again with `--port 8788`. Give the user that exact URL too, in case the browser didn't open. The workspace doesn't need to exist yet.

Install the project's dependencies, even when `node_modules` exists. `prepare` builds the project, and a `node_modules` older than the lockfile is the usual reason a build fails:

```bash
pnpm install --frozen-lockfile
```

Never install with npm or yarn, and never update the lockfile. If the install fails, tell the user why in one line and continue.

Then collect:

```bash
pnpm exec sfnext audit prepare --url home=<home url> --url plp=<plp url> --url pdp=<pdp url>
```

`prepare` runs for 15–30 minutes. Start it so that your tool's command timeout can't kill it (for example as a background job writing to a log file outside the project that you check every few minutes), and never start a second `prepare` while one is running. Don't pass `--archive`, `--categories` or `--events`: they exist for developing the audit itself, and `--categories` skips the rule scripts. When it finishes it prints the path of the run's `prepared.json`. The folder holding that file is the **run folder**, written `<run>` below (`.site-audit/runs/<run id>/`).

If `prepare` fails or a page is missing:

| Symptom | What to do |
|---|---|
| `prepare` exits with an error and prints no `prepared.json` path | The dashboard shows the error too. Tell the user the error in one line and ask before running `prepare` again (each run starts over in a new run folder). Never write `prepared.json` or `audit-result.json` yourself. |
| "Could not download Chromium for Playhouse" | Relay the reason. It is usually a proxy or firewall: the user sets `HTTPS_PROXY` (and `NODE_EXTRA_CA_CERTS` for a TLS-inspecting proxy) and you run `prepare` again. Never install Chrome yourself, never point the audit at system Chrome, and never set `PLAYHOUSE_CHROME_PATH`. |
| Linux: every page fails because Chromium can't start | Ask the user to install its system libraries: `sudo pnpm exec playwright install-deps chromium`. |
| One page failed, the others succeeded | Carry on. The failed page is reported as a coverage gap; no other page is substituted for it. |
| The build failed | Carry on. `prepare` records the reason in `<run>/bundle/analysis.json` and reports the bundle rules as not verified. Tell the user the reason in one line; don't troubleshoot the build. |

## 4. Evaluate the AI rules

Read `<run>/prepared.json`:

- `rules`: the rules left for you. Each entry has a `ruleId`, the rule's Markdown `file`, an optional `data` file and the `output` path to write, relative to `<run>`. This list is the whole AI job.
- `decidedFindings`: the problems the scripts already found. Use them in your summary only; don't evaluate them again.
- `instructions`: the absolute path of the evaluation guide shipped with the SDK. It defines which evidence to read for each rule input, the output file format, dispositions, severities and evidence types. It is version-matched to `finalize`, so follow it rather than your own assumptions.

Then:

1. Group `rules` into batches of at most 3 rules from the same category.
2. Start one subagent per batch, in parallel (as many at once as your tool allows), with the prompt below. Subagents need a shell (`curl`, `jq`) and read access to the project. If you can't start subagents, work through the batches yourself, following the same guide.
3. As each batch reports back, add a line to the dashboard's activity log so the user can see analysis moving:

   ```bash
   pnpm exec sfnext audit progress --event '{"type":"log","level":"info","message":"Evaluated <n> of <total> rules (<category>)"}'
   ```

   These lines are optional and never change the report. Send only `log` events. The CLI accepts some other types, but `prepare` and `finalize` already write them, and findings you send would be counted twice.

Subagent prompt (fill in the placeholders):

> You are evaluating Storefront Next site audit rules `<rule ids>` in the run folder `<absolute run path>`. Read and follow `<instructions path>` exactly; it says what to read for each rule and the file format to write. The project at `<absolute project path>` is read-only. Write only each rule's `output` file; `output` paths in `prepared.json` are relative to the run folder, so create any missing parent folders there. Reply with one line per rule: rule id, disposition, one-sentence gist.

Before you go on, check that every rule has its file, and rerun the batch for any that is missing (a rule without a file is reported as not verified):

```bash
cd <run> && jq -r '.rules[].output' prepared.json | while read -r f; do [ -f "$f" ] || echo "missing $f"; done
```

## 5. Write the summary

Write `<run>/ai-analysis/summary.json` from the subagents' replies and `decidedFindings`:

```json
{
  "narrative": "Ready to launch after a few fixes; nothing found blocks launch.",
  "highlights": [
    "Cut main-thread blocking on home and PLP: TBT is 1.2 s and 1.1 s against a 200 ms budget.",
    "Sanitize the promotion HTML before it reaches dangerouslySetInnerHTML."
  ],
  "observations": [
    { "title": "Tag manager needs eval", "category": "security", "summary": "…", "evidence": [] }
  ],
  "coverage": [
    { "category": "best-practices", "status": "partial", "note": "Checkout was not exercised end to end." }
  ]
}
```

- `narrative`: one plain sentence on where the launch stands. Don't state a verdict yourself: `finalize` derives it from the findings (any critical finding is no-go, any high or medium one is go-with-fixes, otherwise go).
- `highlights`: up to 6 bullets, most important first, one sentence each: what to fix and where, with the measured number when there is one. Leave out passes and not-verified rules; the report lists them. Linking a measured problem to its cause in the source belongs here.
- `observations`: useful points outside the rule catalog. Each needs a `title`, a `summary` and an `evidence` list (same evidence types as rule files; `[]` is allowed); `category` is optional. Use `[]` when there are none.
- `coverage` (optional): page- or category-level gaps, each with a `category` or `page`, a `status` of `covered`, `partial` or `missing`, and a `note`. Use category ids and page labels exactly as they appear in `prepared.json`; `finalize` rejects unknown ones. Don't add entries for single rules: the report derives rule coverage from each rule's disposition.

Write findings as suggestions about the storefront as it is today. Don't attribute problems to where code came from.

## 6. Finalize

```bash
pnpm exec sfnext audit finalize
```

It validates every file in `<run>/ai-analysis/`, writes `<run>/audit-result.json`, and flips the open dashboard to its completion screen. Each validation error names the file to fix. Fix that file (or rerun its batch) and run `finalize` again; never weaken or delete evidence to get past an error. The dashboard shows a failed `finalize` and clears the error on the next successful one.

## 7. Review with the user

The user opens the full report from the dashboard's **Open report** button. Base your reply on `<run>/audit-result.json` (`finalize` prints its path):

1. Give the launch guidance (`summary.guidance`: go, go-with-fixes or no-go) and the narrative.
2. Walk through the highest-severity findings with their measured numbers and where to fix them.
3. List the not-verified rules and what would verify each.
4. Offer to fix specific findings, one at a time, now that the audit is done.

If the dashboard was closed, run `pnpm exec sfnext audit serve` again: it opens the latest run, and its run picker switches to or deletes earlier ones. Stop the background server job when the user is done. Each `prepare` creates a new run, and `progress` and `finalize` always act on the latest one.
