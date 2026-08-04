# Discord always-on departments design

- Status: approved design, pending implementation plan
- Date: 2026-08-04
- Owner: Sandora Owner
- Coordinator: CEO
- Affected systems: Discord bridge, Herdr coordination, demo-company workspace

## Outcome

The Owner can chat directly with five always-available department leads in
their Discord channels while CEO remains the executive coordinator. Each lead
may answer bounded specialist work directly, escalate cross-functional or
consequential work to CEO, and create bounded worker clones when parallel work
is justified. Discord shows a curated company activity timeline and a separate,
redacted system-health log suitable for a terminal-first demonstration.

## Accepted decisions

- Use five always-on departments: Product, Design & 3D, Engineering, Finance,
  and Operations.
- Run six persistent Herdr main-agent sessions including `ceo`.
- Give department leads hybrid authority: direct specialist answers, CEO
  escalation for cross-functional work, approvals, and consequential choices.
- Permit elastic worker clones when a lead is busy and a new task is
  independent.
- Keep `#agent-activity` curated and human-readable.
- Keep `#system-log` limited to health transitions, warnings, and errors.
- Use department leads plus elastic workers rather than bridge-owned worker
  pools or a general job-bus platform.

## Scope

In scope:

- inbound task admission from the Owner in department channels;
- stable channel-to-lead routing;
- six always-on Herdr lead sessions;
- elastic worker creation under a department lead;
- cross-department handoffs and CEO escalation;
- durable request, assignment, event, and outbox state;
- curated Discord activity and redacted system-health events;
- recovery, fallback, security, and demo acceptance tests.

Out of scope:

- public or multi-tenant Discord access;
- arbitrary users commanding department agents;
- a web dashboard or visual workflow builder;
- replacing Herdr with Discord as an agent runtime;
- automatic production deployment, financial commitment, credential use, or
  governance changes;
- a general-purpose distributed job platform.

## Operating topology

The persistent Herdr topology is:

```text
ceo
├── product-lead
├── design-lead
├── engineering-lead
├── finance-lead
└── operations-lead
```

Each lead is a main-agent session with a stable live name, department profile,
Discord channel, and reporting line to `ceo`. Persistent leads do not inherit
CEO authority. They may answer specialist tasks within their department and
must escalate work that is cross-functional, approval-gated, or consequential.

When a lead is occupied and a new request is independent, the supervisor may
create a worker such as `design-worker-01`. A worker owns one bounded work
packet, cannot claim lead or CEO authority, cannot create more agents, and must
produce a durable artifact or handoff. The lead reviews worker evidence before
the Owner receives a departmental result. The worker pane may close only after
its result has been preserved and accepted.

There is no fixed global lane cap. Every clone requires a distinct request or
independent workstream, an owner, an expected artifact, acceptance evidence,
and a stop condition. The supervisor stops adding lanes when coordination,
quota, latency, or review cost exceeds the expected benefit.

## Channel contract

| Discord channel | Primary receiver | Contract |
| --- | --- | --- |
| `#ceo-office` | `ceo` | Strategy, cross-functional work, decisions, and synthesis |
| `#product` | `product-lead` | Roadmap, requirements, PM, research, and prioritization |
| `#design` | `design-lead` | UI/UX, brand, visual review, and 3D assets |
| `#engineering` | `engineering-lead` | Architecture, implementation, testing, and performance |
| `#finance` | `finance-lead` | Revenue, cost, forecast, and quarterly reporting |
| `#operations` | `operations-lead` | Delivery, risk, schedules, and operating reviews |
| `#approvals` | `ceo` | Owner decisions required to resume blocked work |
| `#executive-reports` | output only | CEO-approved consolidated reports |
| `#agent-activity` | output only | Curated human-readable execution timeline |
| `#system-log` | output only | Redacted health, warning, and error events |
| `#general` | no task dispatch | Greetings and company announcements |
| `#tech-company` | no task dispatch | Demonstration and company-wide showcase messages |

Only the configured Owner ID may admit a task. A department acknowledgement
names the department and stable request ID. The answer returns to the source
channel even when other departments contribute. Cross-functional activity may
appear in participating department channels, but CEO owns consolidated output.

Conversation continuity comes from durable request and artifact records, not
from loading an unbounded Discord transcript into agent context.

## Components and boundaries

### Discord gateway

Receives messages, applies guild/user/channel allowlists, sends acknowledgements,
and delivers durable outbox messages. It does not choose models, manufacture
project context, or act as an executive coordinator.

### Channel router

Maps an admitted channel to a stable department lead and reply channel. It
rejects task admission from output-only or non-task channels.

### Durable request store

Persists immutable inbound records and mutable state before dispatch. It is the
source of truth for request identity, ownership, state, recovery, and delivery.

### Department supervisor

Maintains the six-lead registry, reconnects or starts missing leads, assigns
requests, decides whether an independent busy-lead request needs a worker, and
records lifecycle events. It follows CEO routing policy and cannot bypass
approval boundaries.

### Herdr adapters

Use canonical lifecycle-aware control for supported agents and bounded raw-pane
control for CMDC or AGY where required. Every wait has a timeout. Raw sessions
use scoped prompts, completion markers, bounded output, and explicit fallback.

### Durable outbox

Stores departmental updates, final answers, reports, approvals, and errors.
Discord delivery remains retryable and independently observable.

### Event publisher

Transforms internal state transitions into curated `#agent-activity` events or
redacted `#system-log` events. It never publishes prompts, chain-of-thought,
credentials, or full stack traces.

## Request model and lifecycle

Every request records:

- stable request ID and optional parent request ID;
- source and reply channels;
- department owner and assigned lead or worker;
- runtime and model actually used;
- state and timestamps;
- approval requirement;
- artifact and handoff paths;
- fallback and delivery evidence.

The lifecycle is:

```text
admitted
→ assigned
→ submitted
→ working
→ blocked | completed | failed
→ delivered
```

The `submitted` boundary is non-replayable when Herdr prompt acceptance is
ambiguous. Recovery must inspect agent state and durable artifacts instead of
automatically executing Owner work twice.

## Dispatch and handoff flow

1. The gateway admits a verified Owner message and persists it.
2. The router selects the department lead from the source channel.
3. The supervisor inspects the lead and current assignments.
4. If the lead is available, the lead receives the request.
5. If the lead is busy and the task is independent, the supervisor creates a
   bounded department worker and assigns the request.
6. If the request is cross-functional or approval-gated, the lead sends a
   durable handoff to CEO.
7. Contributing departments receive bounded packets rather than full chat
   history.
8. The owning lead validates worker evidence and creates the departmental
   response, or CEO creates a consolidated response.
9. The durable outbox delivers the result to the originating channel.

A handoff packet contains the intended outcome, relevant context paths,
boundaries, approval gates, expected artifact, acceptance evidence, stop
condition, reporting line, and parent request ID.

## Registry and restart behavior

The supervisor registry records channel ownership, stable agent name, Herdr
pane/session ID, lifecycle state, active requests, child workers, runtime/model,
last health transition, and latest material error.

On startup the supervisor:

1. reads durable registry and request state;
2. reconnects recognized live leads;
3. starts only missing leads;
4. reconciles incomplete workers and artifacts;
5. does not replay requests beyond the non-replayable boundary;
6. publishes one startup summary.

States include `starting`, `idle`, `working`, `blocked`, `recovering`, and
`offline`. Polling may update local health, but Discord receives an event only
when the material state changes.

## Runtime and model routing

Persistent leads require reliable Herdr lifecycle control. The initial baseline
uses canonical Codex sessions for CEO and the five leads, with balanced models
for normal departmental work and higher capability reserved for consequential
synthesis.

Worker runtime selection remains automatic and task-based:

| Work shape | Starting route |
| --- | --- |
| Bounded extraction, formatting, or inventory | CMDC with a verified Go-eligible low-cost model |
| Standard implementation or review | Codex balanced tier |
| Difficult architecture or consequential synthesis | Codex highest-capability eligible tier |
| Genuinely large-context work | Live-checked CMDC Go-eligible long-context candidate |
| Google-oriented task or independent provider review | Time-boxed raw AGY with fallback |

Before every worker start, routing filters candidates by live health,
authentication, plan entitlement, control reliability, task fit, and expected
review cost. It selects the least costly verified candidate that can satisfy
acceptance criteria. CMDC Pro-only models are ineligible on the Owner's Go plan.
AGY may run bounded raw-pane work while its canonical Windows launcher remains
unhealthy. Runtime/model selection, fallback, and material failure evidence are
recorded per task.

## Activity design

`#agent-activity` exists for human comprehension and the demo narrative. It
publishes only:

- request accepted;
- task delegated or worker created;
- cross-department handoff;
- meaningful blocked or approval state;
- completion with concise evidence and duration.

An event names the department, event type, request ID, owner, concise task
label, and relevant artifact or evidence. It does not publish routine polling,
heartbeats, full prompts, transcripts, or hidden reasoning.

## System-log design

`#system-log` publishes:

- bridge and agent health transitions;
- runtime/model availability or fallback warnings;
- dispatch timeout, retry, and recovery summaries;
- permanent outbox failure;
- one startup summary with bridge state, available leads, runtime health, and
  enabled schedules.

Each message includes a timestamp, stable event code, request ID when relevant,
and a short recovery action. Full diagnostics remain local. Tokens, prompts,
transcripts, and sensitive task contents are prohibited. Health checks post
only on a material state transition.

## Failure and recovery policy

- Missing lead: reconnect, then start a replacement with the stable name.
- Busy lead: create a worker only for an independent request.
- Worker start failure: preserve assignment, select an eligible fallback, or
  report blocked; never claim dispatch succeeded.
- Ambiguous post-submission timeout: stop automatic replay and enter recovery.
- Worker crash: preserve artifacts and let the lead resume or replace it.
- Raw CMDC/AGY timeout: preserve bounded output and use the recorded fallback.
- Discord delivery failure: retry with exponential backoff, then preserve the
  record under the failed outbox.
- Herdr outage: continue durable Discord admission but pause new execution.
- Event-publisher failure: do not fail the underlying task; record diagnostics
  locally and retry the event separately.

## Security and authority

- Only the configured Owner ID may admit tasks.
- Output-only channels cannot create work.
- Department leads and workers follow existing destructive-action, credential,
  deployment, financial, governance, and scope-expansion approval gates.
- Bot credentials remain outside Git and agent child environments.
- Discord permissions remain least-privilege; Administrator is unnecessary.
- System logs and activity events are redacted by construction.
- Worker clones cannot create more agents.

## Acceptance criteria

The implementation is ready for the demo only when observable evidence proves:

1. startup reports six of six persistent leads available;
2. each department channel routes to the correct lead and receives a reply;
3. a second independent request to a busy lead creates a visible worker clone;
4. a Design-to-Engineering handoff preserves the parent request;
5. cross-functional work reaches CEO and returns one consolidated result;
6. approval-gated work pauses and resumes from durable state;
7. a terminated worker is detected and recoverable;
8. bridge restart preserves admitted requests and pending output;
9. Discord delivery failure retries and records final failure correctly;
10. Discord logs contain no token, prompt, transcript, or hidden reasoning;
11. CMDC Go and raw AGY execute suitable bounded fixtures with real fallback
    evidence;
12. the demo timeline visibly progresses through accepted, delegated, handoff,
    and completed states.

Unit tests cover allowlists, channel routing, state transitions, clone admission,
handoff ancestry, redaction, retry, and restart reconciliation. Integration
tests use controlled Herdr adapters for canonical and raw-pane paths. A private
Discord smoke test validates the six live leads, worker creation, handoff,
activity publishing, system-health logging, and outbox delivery.

## Rollout boundary

Implementation should be staged: durable schema and router, persistent lead
supervisor, department dispatch, worker elasticity, event publishing, then
failure injection and live smoke testing. Existing CEO-only Discord operation
must remain recoverable until department routing passes validation. Schedules
remain disabled until the new topology passes the private smoke test.
