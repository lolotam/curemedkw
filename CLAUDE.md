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
