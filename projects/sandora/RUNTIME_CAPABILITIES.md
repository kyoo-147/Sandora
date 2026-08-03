# Runtime capability snapshot

This is dated operational evidence, not a permanent model ranking. Verify a
profile again after runtime, plan, model-catalog, integration, or observed
behavior changes.

Last verified: 2026-08-03

| Runtime / model | Health | Entitlement | Herdr control | Verified use | Automatic routing status |
| --- | --- | --- | --- | --- | --- |
| Codex `gpt-5.6-sol` | Healthy | Available in current Codex session | Canonical lifecycle-aware agent, integration v7 | CEO session and prior peer work | Eligible for consequential synthesis |
| Codex `gpt-5.6-terra` | Healthy | Available in current Codex session | Canonical lifecycle-aware agent, integration v7 | Three read-only research peers completed | Eligible for standard peer work |
| CMDC `gpt-5.6-luna` | Healthy | Verified on Owner's Go plan | Raw Herdr pane; no agent lifecycle | Read two scoped files and returned a bounded routing review | Eligible for bounded, cost-sensitive tasks |
| CMDC open models | Candidate | Go documentation includes open models; verify selected model live | Raw Herdr pane | Catalog only unless separately profiled | Eligible only with task-specific validation |
| CMDC Claude, Terra/Sol, Gemini | Gated | Pro/Max or extra/provider usage; Owner currently uses Go | Raw Herdr pane | Claude Sonnet 5 returned a plan gate | Ineligible unless Owner changes entitlement or explicitly authorizes extra usage |
| AGY `1.1.10` | Raw-fallback verified; canonical unhealthy | Authenticated Google AI Pro account; UI shows quota warning | Canonical start broken by empty PowerShell argument list; raw pane launches | Gemini 3.1 Pro returned `AGY_TEST_OK` in about 5 seconds and completed a 600-800-word, six-file read-only analysis in roughly 2-3 minutes | Eligible for bounded and explicitly time-boxed substantive work through raw pane; not canonical auto-dispatch |

## Observed control evidence

### CMDC on Go

- `cmdc --model claude-sonnet-5` launched but the task returned: available on
  Pro and above or extra on-demand usage.
- Switching in-session with `/model gpt-5.6-luna` succeeded.
- `gpt-5.6-luna` completed a read-only task against `AGENTS.md` and
  `docs/operations/MODEL_ROUTING.md` in about 12 seconds.
- CMDC is not a canonical Herdr agent kind in the installed build. Control it as
  a raw pane and use bounded output markers plus explicit timeouts.

### AGY

- `herdr agent start ... --kind agy` timed out because the Windows launcher
  generated `Start-Process -FilePath agy -ArgumentList ''`; PowerShell rejects
  the empty argument list before starting AGY.
- Running `agy` directly in a Herdr pane launched Antigravity CLI `1.1.10`,
  showed the authenticated account and Gemini 3.1 Pro selector, and returned
  `AGY_TEST_OK` for a bounded prompt in about 5 seconds. The UI still reported
  `AI: Out of credits`.
- A second raw-pane run completed a 600-800-word report after reading six
  scoped Sandora files in roughly 2-3 minutes and returned the requested
  completion marker. The same quota warning remained visible, so the warning
  did not block this observed substantive task.
- `herdr agent start ... --kind agy` still generated
  `Start-Process -FilePath agy -ArgumentList ''`; PowerShell rejected the empty
  argument list before AGY started.
- Non-interactive version probes previously exited with access-violation code
  `0xC0000005`; the current direct probe now returns `1.1.10`, so that part of
  the earlier diagnosis is stale.
- Use raw AGY for bounded or explicitly time-boxed substantive tasks, with a
  fallback ready if the provider stops mid-run. Canonical automatic dispatch
  remains disabled until the Herdr launcher is fixed. Repeated long-horizon
  implementation runs still need separate evidence.

## Automatic fallback order

1. Remove unhealthy, unauthenticated, plan-gated, and uncontrollable candidates.
2. Prefer a verified low-cost candidate that meets the task's acceptance risk.
3. For Go-plan CMDC work, start with `gpt-5.6-luna` for bounded tasks or a
   task-appropriate open model after a live availability check.
4. Fall back to Codex Terra for standard work and Codex Sol for consequential
   synthesis when CMDC task fit or control evidence is insufficient.
5. Skip AGY while its health is `Unhealthy`; report it only when the missing
   provider perspective materially affects confidence.

## Sources

- CMDC Go plan: `https://commandcode.ai/docs/plans/go`
- CMDC model catalog: `https://commandcode.ai/docs/reference/cli/models`
- Antigravity models: `https://antigravity.google/docs/models`
