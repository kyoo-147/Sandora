# Herdr operating guide

## Purpose

Herdr is Sandora's only delegation surface. It organizes persistent terminal
work into workspaces, tabs, panes, and recognized agent processes. Each spawned
agent remains a main interactive CLI agent in its own pane.

## Gate 0: prove caller context

Before any Herdr control command, verify:

```powershell
$env:HERDR_ENV
$env:HERDR_WORKSPACE_ID
$env:HERDR_TAB_ID
$env:HERDR_PANE_ID
```

Continue only when `HERDR_ENV` is `1`. If it is absent, do not inspect or
control the user's focused Herdr session from outside. Report that CEO must be
started inside Herdr.

The primary coordinating pane must have the live name `ceo`. Verify or assign it
with `herdr agent get $env:HERDR_PANE_ID` and `herdr agent rename
$env:HERDR_PANE_ID ceo`. Peer panes use unique functional names and report to
`ceo`; they do not inherit CEO authority merely by loading repository guidance.

For the installed command syntax, use `herdr --help`, the relevant command
group, and `herdr --skill`. The installed binary is authoritative.

## Progressive disclosure levels

### Level 1 — topology only

Use when deciding where work belongs:

```powershell
herdr workspace list
herdr tab list --workspace $env:HERDR_WORKSPACE_ID
herdr pane list --workspace $env:HERDR_WORKSPACE_ID
herdr agent list
```

Read JSON IDs from command responses. Never infer IDs from sidebar order.

### Level 2 — one target's state

Use only after selecting a relevant agent or pane:

```powershell
herdr agent get <agent-name-or-pane-id>
herdr pane get <pane-id>
herdr pane process-info --pane <pane-id>
```

Lifecycle states mean:

- `working`: active execution.
- `blocked`: approval or user input is likely required.
- `done`: background work settled and has not yet been viewed.
- `idle`: ready for input and already seen.
- `unknown`: detection is uncertain; it does not prove completion.

### Level 3 — bounded output

Read only the tail needed for a decision:

```powershell
herdr agent read <target> --source recent-unwrapped --lines 120
```

Increase the line count only when required. If alternate-screen history is no
longer recoverable, ask that agent to write its complete result to a scoped
Markdown artifact and return the path.

### Level 4 — diagnostics

Use only for incorrect detection, stalled prompts, or protocol work:

```powershell
herdr agent explain <target>
herdr api snapshot
herdr api schema --json
```

Do not load full API schema or all pane output during normal coordination.

## Dispatch procedure

1. Identify the project and read its profile.
2. Define one bounded work packet:
   - outcome;
   - working directory;
   - relevant context paths;
   - allowed and prohibited actions;
   - expected artifact;
   - acceptance evidence;
   - approval gates;
   - stopping condition.
3. Reuse a suitable idle agent only when its context matches. Otherwise create
   an available shell pane without stealing focus.
4. Start the requested runtime with a unique functional name.
5. Confirm the selected agent is settled before prompting. `agent prompt --wait`
   does not track an individual turn, so an already-working turn may satisfy the
   wait before a newly queued prompt completes.
6. Prompt once and wait for a settled state with an explicit bounded timeout.
7. If blocked or timed out, inspect state and recent output before replying or
   retrying.
8. Read the minimum result, inspect cited evidence, and request a focused
   follow-up only if acceptance is unmet.

Example from inside a Herdr-managed CEO pane:

```powershell
$split = herdr pane split --current --direction right --cwd $PWD --no-focus |
  ConvertFrom-Json
$pane = $split.result.pane.pane_id

herdr agent start repo_research --kind codex --pane $pane -- -m gpt-5.6-terra
herdr agent prompt repo_research `
  "Inspect only the named project surfaces. Return verified findings, file evidence, unresolved questions, and no edits." `
  --wait --timeout 120000
herdr agent read repo_research --source recent-unwrapped --lines 120
```

`agent start` requires an existing pane at an interactive shell prompt; it does
not create layout. Native agent arguments go after `--`.

### Runtime-specific control

- Codex and other healthy canonical kinds use `agent start`, `agent prompt`,
  lifecycle state, and `agent read`.
- CMDC is a raw pane process in this Herdr build. Start it with `pane run`, then
  use `pane send-text`, `pane send-keys ... enter`, `pane wait-output`, and
  bounded `pane read`. Do not call `agent wait` or infer lifecycle state for it.
- For raw-pane completion markers, describe the marker composition in the prompt
  without including the exact contiguous marker. Wait with a line-anchored regex
  such as `^\s*MARKER\s*$`; otherwise the submitted prompt itself can satisfy
  the wait.
- Handle a first-run trust prompt only for the exact scoped repository already
  authorized by the Owner. Never broaden trust automatically.
- AGY canonical dispatch remains unavailable while the Windows launch adapter
  emits an empty PowerShell `ArgumentList`. Raw AGY is verified for bounded and
  explicitly time-boxed substantive work: `1.1.10` with Gemini 3.1 Pro returned
  a short test marker and completed a 600-800-word, six-file read-only analysis
  in roughly 2-3 minutes, even though the UI displayed `AI: Out of credits`.
  Keep a fallback ready and do not treat raw AGY as canonical lifecycle-aware
  automation until the adapter is fixed.

CMDC raw-pane example for the Owner's current Go plan:

```powershell
$split = herdr pane split --current --direction right --cwd $PWD --no-focus |
  ConvertFrom-Json
$pane = $split.result.pane.pane_id

herdr pane run $pane "cmdc --model gpt-5.6-luna --skip-onboarding"
herdr pane wait-output $pane --regex 'Ask your question\.\.\.' --timeout 60000
herdr pane send-text $pane "<bounded work packet ending with a composed marker>"
herdr pane send-keys $pane enter
herdr pane wait-output $pane --regex '^\s*CMDC_TASK_COMPLETE\s*$' --timeout 180000
herdr pane read $pane --source recent-unwrapped --lines 120
```

## Coordination policy

- For Discord department work, allocate supervisor-owned panes in the no-focus
  `Departments` tab; never split the CEO/Bridge tab for department agents.
- For unrelated manual work outside the bridge, default to a sibling pane in
  the current tab and current working directory.
- Create a new workspace only for a distinct project or when the Owner asks for
  that topology.
- Use `--current`, explicit IDs, or unique live names. Do not rely on UI focus.
- Use `--no-focus` for background work.
- Parallelize only independent workstreams with distinct artifacts.
- Never dispatch duplicate research without an explicit independent-review
  purpose.
- Do not close panes, tabs, workspaces, or sessions you did not create.
- Never stop the Herdr server from an active session unless the Owner explicitly
  asks to end it.
- Retry only after identifying a changed condition; cap retries and preserve
  useful evidence.
- Every `agent wait`, `agent prompt --wait`, and `pane wait-output` call must use
  a task-appropriate timeout. An unbounded wait can deadlock the coordinator.

### Batch sizing

- Use zero peer lanes when CEO can complete and verify the bounded task directly.
- Use one lane for specialization or context isolation, and two lanes for
  independent work plus review when that materially improves the result.
- There is no fixed numeric lane cap. CEO decides the lane count per task from
  the task graph, dependency structure, consequence of error, specialization
  value, independent-review value, runtime health, entitlement, quota, latency,
  and total review cost.
- Start with the smallest sufficient graph and add a lane only when it removes
  a concrete dependency, supplies independent evidence, owns a distinct
  artifact, or provides a materially better runtime/model fit. Department names
  alone never justify another lane.
- For large tasks, use staged waves when dependencies require them and parallel
  batches when work is genuinely independent. Before each wave, CEO must record
  the purpose of every lane, expected output, acceptance evidence, stop
  condition, and the aggregate cost/attention impact.
- Do not fan out merely because capacity exists. Stop adding lanes when the
  expected marginal quality, speed, or risk reduction is lower than the added
  coordination, quota, cost, or context pressure. A large lane graph is valid
  only when its structure is explainable and each lane is actively useful.
- Monitor aggregate status at topology level, then inspect only blocked, timed-
  out, or acceptance-critical targets. Do not poll every transcript.

## Current local capability snapshot

Verified on 2026-08-03:

- Herdr `0.7.5-preview.2026-07-29-44b3adb12552` is installed.
- Client and server are running the same protocol-compatible build.
- Supported `agent start` kinds include `codex`, `agy`, `hermes`, and others.
- Command Code is not a canonical `agent start --kind` value in this Herdr
  build. Until detection support is verified, run `cmdc` as a pane process or
  use a supported alias only when official/local evidence establishes it.
- The Codex lifecycle integration is installed and current at integration schema
  `v7`.
- CMDC remains unsupported as a canonical `agent start --kind` value. Use a raw
  pane process only after its detection and control behavior have been verified;
  do not treat a pane process as a lifecycle-aware Herdr agent.

## Sources

- Local authority: `herdr --skill`, `herdr --help`, and command-group help.
- Official docs: `https://herdr.dev/docs/agent-automation/`
- CLI reference: `https://herdr.dev/docs/cli-reference/`
