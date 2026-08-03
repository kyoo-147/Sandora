# Runtime and model routing

## Rule

Provider descriptions are discovery evidence, not a Sandora capability score.
Before production reliance, benchmark the exact runtime-model combination on a
representative task and record quality, latency, cost/usage, tool behavior,
context retention, and failure mode.

At dispatch time, verify availability from the live CLI. Never claim a model is
running merely because it is configured or listed.

## Automatic routing contract

When the Owner omits a runtime or model, CEO must route automatically; omission
does not mean Codex. Apply this order:

1. Classify task shape, consequence of error, context size, tool needs, and
   whether independent provider review adds value.
2. Load `projects/sandora/RUNTIME_CAPABILITIES.md` and remove candidates that are
   unhealthy, unauthenticated, plan-gated, quota-blocked, or not reliably
   controllable through Herdr.
3. Among remaining candidates, choose the least costly verified pair likely to
   meet acceptance criteria.
4. Decide the smallest sufficient lane graph. Dispatch one or more peers when
   specialization, isolation, independent review, or parallelism materially
   improves the outcome; otherwise work directly. There is no fixed numeric
   lane limit, but every additional lane requires a distinct dependency,
   artifact, evidence stream, or runtime advantage and must justify its added
   quota, cost, latency, and review load.
5. Record the selected runtime/model, reason, observed availability, fallback,
   and material usage/cost in the task result or durable plan.

Do not ask the Owner to choose among routine candidates. Ask only when selection
requires new credentials, a plan upgrade, extra paid usage, or a consequential
quality/cost tradeoff outside existing authority.

## Default routing

| Work shape | Preferred starting point | Why |
| --- | --- | --- |
| Executive synthesis, difficult architecture, conflicting evidence, high-impact review | Codex + `gpt-5.6-sol`, medium/high | Highest-capability OpenAI tier; reserve for judgment-heavy work |
| Standard implementation, repository exploration, routine review | Codex or CMDC + `gpt-5.6-terra` or another verified balanced model | Better cost/capability balance |
| Repetitive extraction, inventory, formatting, bounded low-risk tasks | Codex/CMDC + `gpt-5.6-luna` or a verified fast model | Optimize latency and cost |
| Very large-context repository scan | CMDC + a verified long-context model such as Kimi K2.7 Code or GLM 5.2 | Live CMDC catalog advertises long-horizon/1M-context options |
| Google-oriented tool workflow or independent provider review | AGY + Gemini 3.6 Flash or Gemini 3.1 Pro | Native Antigravity harness and current official model menu; verify local entitlement first |

These are starting heuristics, not permanent rankings.

## Codex / OpenAI

Live local baseline on 2026-08-03:

- Codex CLI: `0.146.0`.
- Project default inherited from user config: `gpt-5.6-sol`, medium effort.
- Sandora project config disables native multi-agent tools; peer agents must be
  started through Herdr.

Official GPT-5.6 tiers:

| Model | Use | Avoid as default when |
| --- | --- | --- |
| `gpt-5.6-sol` | Frontier professional work, complex coding, architecture, science/security, consequential synthesis | A cheaper verified model meets acceptance criteria |
| `gpt-5.6-terra` | Balanced everyday professional and agent work | The task is trivial/high-volume or truly frontier-difficult |
| `gpt-5.6-luna` | Fast, cost-sensitive, high-volume bounded work | Errors are expensive or deep cross-file judgment is required |

Official API list prices observed on 2026-08-03 per 1M tokens:

- Sol: $5 input / $30 output.
- Terra: $2.50 input / $15 output.
- Luna: $1 input / $6 output.

Sol exposes a 1,050,000-token context window and supports reasoning efforts
through `max`. Long context is capacity, not permission to load unrelated data.

## Command Code (`cmdc`)

Live local baseline:

- Version: `1.9.0`.
- `cmdc --list-models` returned 50 available models in the latest check on
  2026-08-03. An earlier same-day run returned 51, and the official generated
  catalog still listed 51. Treat this as evidence that catalog and entitlement
  views can diverge or change during the day.
- The live registry, not this document, is the source of truth for model IDs.
- Owner entitlement: CMDC Go plan. Go includes open models plus selected premium
  models such as GPT-5.6 Luna; Claude, GPT-5.6 Terra/Sol, Gemini, and most other
  premium models require Pro/Max or separately authorized extra/provider usage.

Useful routing families from the current registry:

- GPT-5.6 Sol/Terra/Luna: align with the OpenAI tiers above.
- Claude Sonnet 5: catalog labels it the speed/intelligence default.
- Claude Fable 5 / Opus 5: reserve for demanding reasoning or an independent
  non-OpenAI review after benchmarking.
- Kimi K2.7 Code and GLM 5.2: candidates for long-horizon or very large-context
  repository work.
- DeepSeek V4 Flash, Qwen Flash, Gemini Flash/Lite, and other fast models:
  candidates for bounded, high-volume work.
- Gemini 3.6 Flash, 3.5 Flash Lite, and 3.1 Flash Lite are current CMDC catalog
  candidates for Google-family coding or high-volume work; their descriptions
  are vendor claims until benchmarked.

Use `cmdc --list-models` immediately before routing. Pass the model with
`--model`. Do not use CMDC's own custom subagent system; start one CMDC main
session per Herdr pane. Herdr `0.7.5-preview` does not list `cmdc` as a canonical
agent kind, so treat it as a raw pane process until detection is verified.

Verified Go-plan starting points:

- `gpt-5.6-luna`: completed a bounded read-only Sandora task; use for low-risk,
  cost-sensitive work with explicit validation.
- DeepSeek V4 Flash or another live Go-eligible open model: candidate for
  high-volume bounded work; benchmark before broader reliance.
- GLM 5.2 or Kimi K2.7 Code: Go-eligible candidates when genuinely large context
  is required; catalog capacity does not prove retrieval quality.

Never select a catalog model for CMDC without checking plan eligibility. A model
appearing in `--list-models` can still reject a task at execution time.

## AGY / Google Antigravity CLI

Live local baseline:

- `agy.exe` is installed locally as `1.1.10`; direct launch reaches an
  authenticated Google AI Pro account and the model selector.
- The current account UI reports `AI: Out of credits`, but both a short raw-pane
  prompt and a 600-800-word, six-file read-only analysis completed successfully;
  repeated implementation-scale quota behavior remains unresolved.
- A live Herdr smoke test failed before AGY startup: canonical `--kind agy`
  generated `Start-Process -FilePath agy -ArgumentList ''`, which PowerShell
  rejects. Raw `agy` bypasses this adapter bug and launches, but remains quota
  blocked.
- Current canonical automatic-routing health is `Unhealthy` because the Herdr
  launcher is broken. Raw-pane AGY is allowed as an explicit fallback for
  bounded and time-boxed substantive tasks after a live prompt check. Keep a
  fallback ready for implementation-scale or consequence-heavy work until
  repeated quota behavior is benchmarked.

Official current reasoning-model menu includes:

- Gemini 3.6 Flash, low, medium, and high variants.
- Gemini 3.5 Flash.
- Gemini 3.1 Pro, high and low variants.
- Claude Sonnet 4.6 (thinking).
- Claude Opus 4.6 (thinking).
- GPT-OSS-120b.

Availability varies by plan. Model selection is sticky within a conversation;
changing it mid-turn does not change the active turn. Use `/usage` or `/quota`
inside AGY to refresh available quota information.

Starting heuristic:

- Gemini 3.6 Flash for normal implementation and responsive tool work after the
  model appears in the authenticated local selector.
- Gemini 3.5 Flash as a fallback when it is available and 3.6 is not.
- Gemini 3.1 Pro low for balanced analysis; high for difficult architecture or
  review.
- Claude thinking variants only when cross-provider reasoning or review value
  justifies quota/cost.
- GPT-OSS-120b as an experimental alternative until local benchmarks establish
  its niche.

AGY supports `AGENTS.md` and project custom agents, but Sandora must not ask AGY
to fan out internal subagents. Herdr owns every additional session.

## Capability profile protocol

For each runtime-model pair, record:

```text
runtime + version
model + effort/mode
availability/auth verified at
task class and fixture
tools and permissions
context package size
quality evidence
latency
reported usage/cost
failure and retry behavior
recommended / avoid / unknown
```

Refresh a profile after a material CLI/model update or when observed behavior
contradicts it.

Catalog descriptions and context-window claims are discovery evidence only.
They do not establish retrieval quality, tool reliability, or task performance.
A routing profile may govern production work only when it records source, date,
environment, method, acceptance evidence, and known limits.

## Sources

- OpenAI GPT-5.6 guidance: `https://developers.openai.com/api/docs/guides/latest-model`
- OpenAI Sol model page: `https://developers.openai.com/api/docs/models/gpt-5.6-sol`
- Command Code live registry: `cmdc --list-models`
- Command Code docs: `https://commandcode.ai/docs/reference/cli/models`
- Antigravity models: `https://antigravity.google/docs/models`
- Antigravity CLI: `https://antigravity.google/docs/cli/overview`
