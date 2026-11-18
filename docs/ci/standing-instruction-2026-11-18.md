# CureMed CI standing instruction: applicability and baseline

Recorded: 2026-11-18. Canonical manager rule: [AGENTS.md](../../AGENTS.md). Tracker: [issue #43](https://github.com/lolotam/curemedkw/issues/43). Responsible execution owner: CureMed project manager; accountable owner and approval decisions: Waleed (@lolotam). Initial review due: **2026-12-02, Asia/Kuwait**.

Status: instruction recorded; performance rollout deferred because no measurable repository build/test CI workflow exists. This is not a project freeze. No workflow, deployment trigger, branch protection, security check, test, Dockerfile, migration or product code was changed by this record.

## Inspection evidence

Inspected `origin/main` at `6355a407c5c2370a1bee60f20035778b7cb2627e` after fetching main. The local product branch was not used as the CI baseline. The dedicated documentation branch preserves the pre-existing untracked files.

- The main tree has no `.github/workflows` definitions.
- `gh workflow list --all` returned no workflows. GitHub Actions API returned `total_count: 0` for both workflows and workflow runs.
- `package.json` defines `build` (`vite build`), `test` (`vitest run`) and `lint` (`eslint .`), but no repository workflow schedules them. Source definitions are not evidence of a CI run.
- `vitest.config.ts` discovers `src/**/*.{test,spec}.{ts,tsx}` in jsdom. Backend Deno and Python/SQL test areas exist separately; their runtime/isolation must be measured before proposing a shard boundary. No test was executed or weakened for this documentation-only record.
- `Dockerfile` has one application-image path: install dependencies in `builder`, run the Vite build, copy the resulting bundle into the nginx `runner` stage. The runner stage depends on the builder output; these are dependent stages of one image, not independent Docker targets.
- `docker-compose.yml` contains one `web` service with a build. Historical release scripts describe production Dokploy and post-deploy paths, not an isolated pre-merge staging benchmark. No production connector, secret file or deployment setting was accessed for this task.
- Five recent merged code PR heads expose Socket/CodeRabbit external checks. Their timestamps do not establish application build/test coverage, complete required-gate timing, runner usage or attempt counts.
- At capture, the main branch rules endpoint returned an empty list and the legacy branch-protection endpoint returned `Branch not protected (HTTP 404)`. No protection was changed. Do not describe the visible external checks as an enforced aggregate build/test gate; existing owner review/release controls still apply.

Machine-readable capture: [baseline-2026-11-18.json](baseline-2026-11-18.json). Public check URLs have query strings removed to avoid retaining transient access parameters.

## Critical path and applicability

The observed PR path contains external security/review checks, followed by owner merge/release decisions. No application build, test shard, browser-test job or staging-image job is scheduled in an Actions DAG. The Docker production build itself has a real sequential dependency: dependency installation, then Vite compilation, then runtime-image assembly. Do not report this as the duration of the required PR gate.

| Technique | Assessment | Current disposition |
| --- | --- | --- |
| Start independent application builds early | No PR build job or job dependencies to reschedule | Not currently applicable; do not introduce an unreviewed CI workflow as an optimization |
| Start browser checks after real prerequisites | No browser-check CI job/configuration was found in the inspected main tree | Not currently applicable; future browser checks should depend on their actual app/browser setup, not unrelated suites |
| Isolate slow independent test shards | No measured CI suite timings or runner-level isolation evidence | Defer until execution/timing evidence exists; future proposal must account for all discovered tests and propagate all failures |
| Shared Docker stage and at most two parallel builds | One application image; builder and runner are dependent stages | No independent build pair to parallelize; runner memory unknown, not assumed sufficient |
| Move staging image build to main only | No pre-merge staging-image CI job to move | No movement proposed or approved; any future proposal must state the lost pre-merge image-build coverage and obtain applicable approval |
| Retain final merge gate | No Actions aggregate gate exists; external checks remain unchanged | Any future workflow must aggregate every required outcome and avoid false green results from failed/skipped/cancelled dependencies |
| Preserve release/security/deployment/freeze controls | Existing independent controls remain in force | No changes to automatic deploys, credentials, migrations, production or prior HOLDs |

No optimization or speedup is claimed. There is no evidence-based workflow patch to review now. Creating a first CI pipeline is a separate design/coverage change; if pursued, it must use its own reviewed CI PR and not be mixed into product work. Do not move an existing external or local release check off PRs as a shortcut.

## Baseline saved now

**Qualifying first-attempt successful code-PR build/test CI runs: n = 0.** The requested five-run target cannot be met from the current repository run history.

The following five code-PR heads are saved as external-check references, not substitutes for five comparable CI runs:

| PR | Captured head | Visible external conclusions |
| --- | --- | --- |
| [#38](https://github.com/lolotam/curemedkw/pull/38) | `f72438c94cd25353971ead0ed80601dcd1efc0c3` | Socket success twice; CodeRabbit neutral |
| [#39](https://github.com/lolotam/curemedkw/pull/39) | `e85f76b1311fc0c0cb08e51d6edff70268d9f44b` | Socket success twice; CodeRabbit neutral |
| [#40](https://github.com/lolotam/curemedkw/pull/40) | `aee4bb1a3f6efe84e947850a48e4f72f8fb118d8` | Socket success twice; CodeRabbit neutral |
| [#41](https://github.com/lolotam/curemedkw/pull/41) | `cdbfb88740612124bf0f770e356c29b7a76537bf` | Socket success twice; CodeRabbit success |
| [#42](https://github.com/lolotam/curemedkw/pull/42) | `ff5bce8ab81709aa02f030d3c0c3fc54832b6c97` | Socket success twice; CodeRabbit neutral |

The JSON preserves check IDs, public check/detail links, exact head SHAs, check start/completion timestamps and conclusions. Only final PR heads were captured; earlier head attempts or manual review retries cannot be reconstructed from these snapshots. Neutral is not a successful review. No first-attempt claim is made for these reference checks.

Required-gate wall time, aggregate runner minutes, median gate time, failure/retry rates, runner memory/cache conditions and resource pressure are **not measurable from the captured data**. They are unavailable, not zero. Do not derive a comparison median or saving percentage from external-check elapsed times or from manual tests performed in earlier sessions. No after-rollout sample exists because no rollout occurred.

## Measurement protocol for a future rollout

1. Identify every required gate outcome and its authoritative run/check. Record the workflow version, exact head SHA, code-versus-docs scope, run URL, run attempt, event, branch, queue/run/gate timestamps, runner type/size, dependency and Docker cache conditions, and test selection. Docs-only runs are not code-PR baseline samples.
2. Target five comparable successful first-attempt code PR runs before the change and five after. If there is no instrumented pre-change run, explicitly report a missing baseline; do not fabricate it from manual durations. Keep main runs, reruns and materially different runner/cache regimes in separate strata. Report excluded counts and reasons.
3. Measure **gate wall time** from the triggering required workflow/check request to the time all required automated outcomes for that head are terminal and acceptable, including queueing. Record queue delay and execution span separately; do not use PR creation-to-merge or sum of parallel jobs as gate wall time. If review is a required outcome, state whether its latency is included and apply the same definition before and after.
4. Measure **aggregate runner minutes** as the sum of all relevant runner-allocated job durations for the gate across jobs/workflows. Include retries and partial/cancelled work in a separately reported total. Do not call runner minutes a monetary bill without the applicable pricing and rounding rules; external-app compute costs remain unknown unless supplied.
5. Keep the successful timing sample separate from reliability accounting. For the same observation window, report all eligible attempts, failures, cancellations, retries, first-attempt success rate and flaky cases. Do not hide a failed shard behind a successful rerun or successful-only median.
6. Before parallel Docker work, capture actual runner memory/available headroom and baseline build pressure; begin with at most two concurrent independent builds reusing the shared stage. Record peak memory where available, OOMs, swap, disk pressure and resource-driven failures. Missing telemetry is unknown, not evidence of no pressure.
7. For shards, record full suite inventory, per-shard isolation/setup, coverage-artifact aggregation where coverage is required, and terminal aggregation of every required outcome. A failing, missing, skipped or cancelled required shard must not make the merge gate green.
8. Calculate separate before/after medians for gate wall time and aggregate runner minutes. For a time-saving measure use `before_median - after_median`, and `100 * (before_median - after_median) / before_median`; positive values mean savings. If the baseline median is zero/missing or samples are not comparable, report percentage as unavailable. Show sample sizes, conditions, raw run links and variability, not just a percentage.
9. Record cost/reliability tradeoffs even if elapsed time improves: duplicated setup, higher aggregate minutes, new flakes, coverage moved later, or memory contention. Never remove a required outcome to improve the metric. Any main-only staging-image proposal needs a separate explicit loss-of-pre-merge-coverage assessment and applicable approval before change.

## Follow-up record

- Initial status/before-after report due: **2026-12-02, Asia/Kuwait**.
- Responsible execution owner: **CureMed project manager**. Accountable owner and pending scope decisions: **Waleed (@lolotam)**, assigned on issue #43.
- Rollout date: **none**. If a later CI rollout happens, record the date and its two-week comparison date in the same issue while keeping the initial status review.
- At the due date, recheck available run history and report actual sample sizes and limits. With no rollout/usable baseline, the report must say so; do not imply optimization success or perpetual monitoring.
- This due date is recorded in the existing repository issue tracker. No new schedule, monitoring service or automatic reminder was created.

The records are local/unmerged until their dedicated documentation PR is accepted. Changes to workflows require a separate reviewed CI PR; neither this record nor any existing merge authorization independently authorizes deployment, migration, freeze release or production activation.
