# Automatic runtime routing

- Project: Sandora
- Owner: user
- Status: completed
- Started: 2026-08-03
- Last updated: 2026-08-03

## Outcome

CEO automatically decides whether to work directly or dispatch a Codex, CMDC,
or AGY main-agent session through Herdr. The Owner does not need to name a
runtime for ordinary tasks, and every automatic choice remains evidence-backed,
bounded, and visible in Herdr.

## Scope

In scope: routing policy, live launch/control smoke tests for AGY and CMDC,
fallback behavior, and repository instructions. Out of scope: provider account
changes, purchases, credential entry, production work, and native subagents.

## Context and authority

- `identity.md`
- `AGENTS.md`
- `docs/operations/HERDR.md`
- `docs/operations/MODEL_ROUTING.md`
- Installed Herdr, Codex, CMDC, and AGY behavior
- Official runtime documentation when local behavior is ambiguous

## Workstreams and dependencies

- Prove AGY can start as a Herdr-recognized main agent and complete a bounded
  read-only task, or record the exact blocker.
- Prove CMDC can run as a main interactive process in a Herdr pane and identify
  a reliable bounded control protocol, or record the exact limitation.
- Convert routing heuristics into a mandatory automatic decision procedure with
  explicit fallbacks and capability-profile evidence.

## Approval gates, risks, and recovery

- Do not enter credentials, change provider plans, purchase quota, or alter
  global provider settings without Owner approval.
- Smoke prompts may consume existing authorized quota; keep them minimal and
  stop after one representative task per runtime.
- Close only panes created by this plan. Preserve error/output evidence before
  cleanup.

## Progress

- [x] Confirm Owner wants automatic runtime dispatch without prompting.
- [x] Run AGY smoke task through Herdr and record the launch blocker.
- [x] Run CMDC smoke task through a Herdr raw pane.
- [x] Update automatic routing and fallback instructions.
- [x] Validate effective behavior and complete the plan.

## Decisions

- Accepted: runtime omission means CEO selects automatically; it does not mean
  Codex by default.
- Accepted: all additional sessions remain Herdr-visible main agents/processes.
- Accepted: Owner's current CMDC entitlement is Go. Automatic routing must not
  select Pro/Max-only models or buy extra usage without explicit approval.
- Accepted: CMDC `gpt-5.6-luna` is the first verified Go-plan profile for
  bounded, cost-sensitive work.
- Accepted: AGY is temporarily excluded from automatic dispatch because both
  canonical and raw launch paths failed before a model task could run.

## Validation

- AGY canonical launch in pane `w1:p5` timed out. Bounded output showed Herdr's
  Windows launcher generated an empty `Start-Process -ArgumentList`, which
  PowerShell rejected. Raw `agy` returned immediately to the shell.
- CMDC `claude-sonnet-5` launched in pane `w1:p6` but correctly rejected the
  task as Pro-and-above or extra-usage only.
- CMDC switched to `gpt-5.6-luna`, read only the two authorized documents, made
  no edits, and returned `CMDC_SMOKE_COMPLETE` after about 12 seconds.
- CMDC created an empty `.commandcode/taste/taste.md` during first-run setup;
  the empty generated file and directories were removed after verification.
- Official CMDC Go documentation confirms open-model access plus selected
  premium models including GPT-5.6 Luna; Claude, Terra/Sol, and Gemini require
  higher entitlement or separately authorized usage.
- `AGENTS.md`, `identity.md`, the Sandora project profile, Herdr operations,
  model routing, and `RUNTIME_CAPABILITIES.md` now encode automatic selection,
  entitlement filtering, runtime health, raw-pane control, and fallback rules.

## Result

Runtime omission no longer defaults silently to Codex. CEO must automatically
select and, when justified, dispatch a healthy entitled main-agent runtime
through Herdr. CMDC Luna is operational on the Owner's Go plan. AGY remains a
recorded health blocker and is skipped automatically until a changed runtime or
Herdr launch path passes a smoke task.
