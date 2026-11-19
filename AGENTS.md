<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

# Delivery tiers (Light / Medium / Heavy Implementation Pipeline)

Owner instruction — Waleed (@lolotam), 2026-11-19, relayed from the PosPay manager thread. Reference: PosPay PP-195, lolotam/PayPos.systems#1085. Applies to every new task, side task and follow-up issue in this project. Waleed's verbatim instruction:

> «ابعت بقي ملفات وخطة ال3 pip lines دي لكل المديرين علشان يسجلوها وينفزوها كقاعدة عنهم في كل الشغل ويعملولها merg علطول بدون مراجعة light task كاضافة وثائق في ملفات المشاريع cladue.md file and agent file»

## Tier card first

Before starting any new task (side tasks and follow-up issues included), present Waleed one AskUserQuestion card, in Arabic, exactly 3 options, recommended option first and marked «(المقترح)»: the tier choice with your recommendation, a one-line reason, and an exception option (an extra review or step on top). Start only after his answer. Record the chosen tier and any exception in the task brief and the PR body. Fix rounds inside a running task need no new card.

## LIGHT

- Scope: docs, specs, plans, ADRs, roadmap/status files, i18n, small CSS/UI changes up to ~150 lines.
- Never money, permissions/auth, DB/migrations, API, or a new dependency.
- Implementer: manager or cheapest lane.
- Merge immediately once CI is green on the exact head — this instruction is the approval, no review-bot wait. Repo has no CI: merge directly.
- Staging: none of its own; ships with the next deploy.

## MEDIUM

- Up to 3 review rounds: local review (`/code-review`) plus the project's review bots. This repo has no review bots configured today; when one is added, include it, and skip a bot stuck >1h, saying so in the merge report.
- CI green on the exact head.
- After round 3: P2/P3 findings become issues; P0/P1 block the merge.
- Staging deploy in daily batches.

## HEAVY

- Scope: migrations, money, permissions/auth, security, long background jobs.
- Claude Fable 5.2 (medium effort) writes the implementation plan; Codex Astra 6.2 (medium effort) debates it for ONE round before implementation starts; then full review and CI under the project's round cap.
- A PR containing a migration, money or permissions/auth merges only after Waleed's card approval, after all gates. Other Heavy work: the manager merges after all gates.
- Staging deploy alone, immediately after merge. Migration present: DB snapshot first, receipt kept.

## Implementer fallback (fixed order)

- Light: manager/GLM → Claude Sonnet.
- Medium and Heavy: Kimi → MiniMax → GLM → Grok → Claude Sonnet (Heavy: Sonnet at high effort).
- After 2 failures or exhausted quota, move to the next lane without asking. Use only lanes installed in this project; keep the order.

## Plan summary after every merge

Report the active plan in three parts: «ما تم» (main tasks done, with PR numbers), «الباقي» (each remaining main task with its sub-tasks and status), «التوصية». Fold side tasks under their main task, and keep any roadmap/status file in sync. End every report with these headings exactly: «المطلوب منك»، «الخطوة الجاية اللي أنصح بيها»، «ملاحظة» (write «مفيش» when empty).

## Boundaries

Production, server, secrets and HOLD decisions stay Waleed's. These tiers add routing and merge-speed rules on top of the existing project gates; every gate already in force stays in force (including the CI standing rule of 2026-11-18 when it lands), and a tier never removes a coverage or review requirement the project mandates.

## Canonical CureMed manager guidance: CI — owner instruction, 2026-11-18

This section is the project record of Waleed's standing CI instruction. The applicability assessment, baseline evidence and measurement protocol are in [docs/ci/standing-instruction-2026-11-18.md](docs/ci/standing-instruction-2026-11-18.md). Track execution and the two-week review in [issue #43](https://github.com/lolotam/curemedkw/issues/43), due **2026-12-02, Asia/Kuwait**. Responsible execution owner: **CureMed project manager**; accountable owner and approval decisions: **Waleed (@lolotam)**.

- Inspect the actual workflows and critical path before changing CI. Start independent builds and browser checks as soon as their real prerequisites finish; do not serialize them behind unrelated suites.
- Split slow independent suites into isolated shards without dropping tests, weakening coverage or losing failure propagation. Every required outcome must reach the final merge gate; cancellation, skipped jobs and failed shards must not produce a false green gate.
- Where multiple Docker targets exist, reuse their shared stage and begin with at most two parallel builds only after checking runner memory. Record resource pressure and adjust based on evidence.
- Evaluate main-only staging image builds separately. Document any loss of pre-merge coverage and obtain applicable owner approval before moving that check. A CI speed target never authorizes loss of coverage.
- Keep workflow changes in a dedicated reviewed CI PR, separate from product work. Preserve release, deployment, security, migration, HOLD and freeze controls. Frozen projects may record this instruction and defer execution until explicitly resumed.
- Record why each technique does not apply. Do not invent parallelism, jobs, benchmarks or before/after gains when there is no measured pipeline.
- Save baseline run links now, aiming for five comparable successful first-attempt code-PR runs. Compare with five after rollout; separate main runs, reruns and differing runner/cache conditions. Keep failed attempts in reliability accounting rather than concealing them through the successful sample filter.
- Measure wall-clock time to the required gate, aggregate runner minutes, failures/retries and observed resource pressure. Report sample sizes, medians, absolute and percentage time changes and material cost/reliability tradeoffs. Unknown runner cost or retry history is not zero.
- Recheck after two weeks and give Waleed one before/after report. When volume or observability is insufficient, report the available sample and its limits. Record actual rollout date and a two-week post-rollout due date if rollout occurs after the initial review date; keep the initial status review.

Recording this instruction does not activate a workflow, authorize production operations or claim that these local records are already merged. The initial assessment found no repository GitHub Actions workflows or Actions runs; see the evidence and tracker for the concrete baseline blocker.
