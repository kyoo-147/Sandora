# On-demand Discord departments design

- Status: approved design, pending Owner review of written spec
- Date: 2026-08-04
- Owner: Sandora Owner
- Coordinator: CEO
- Affected systems: Discord bridge, Herdr topology, department supervisor,
  durable agent registry
- Supersedes: the persistent six-lead topology in
  `2026-08-04-discord-always-on-departments-design.md`

## Outcome

Sandora keeps only CEO and the Discord Bridge permanently visible. A department
lead starts when its Discord channel receives work, remains warm for ten minutes
after completing its last request, and then closes automatically. All active and
warm department panes live in one ephemeral Herdr tab named `Departments`, so
department work never divides the Executive tab into unreadable columns.

The change preserves department authority, durable request state, elastic
workers, handoffs, persona webhooks, and the Herdr-only agent boundary. It
changes lifecycle and layout, not organizational responsibility.

## Accepted decisions

- Keep `ceo` and the Discord Bridge permanently in the Executive tab.
- Start department leads only when work is assigned to their department.
- Put every active or warm department lead and worker in one `Departments` tab.
- Keep an idle lead warm for ten minutes and reuse it for follow-up work.
- Reset the ten-minute lease whenever the lead accepts new work.
- Close task-scoped workers immediately after their artifact or handoff is
  durably accepted.
- Close the `Departments` tab when its final supervised pane closes.
- Recreate the tab and lead from durable context when work arrives later.
- Reserve Codex `gpt-5.6-sol` for CEO. Select CMDC or raw AGY dynamically for
  department leads and workers from live task fit, entitlement, health, and
  control evidence; non-CEO fallback must never use Sol.

## Scope

In scope:

- demand-driven department lead startup;
- explicit tab creation, pane placement, ownership, and cleanup;
- warm leases and follow-up reuse;
- safe migration from the current always-on topology;
- startup and health semantics for offline departments;
- lifecycle events, recovery behavior, and deterministic tests.

Out of scope:

- changing department channel ownership or approval authority;
- changing CEO, Discord, persona, attachment, handoff, or outbox contracts;
- pausing or terminating blocked or ambiguous work;
- a general scheduler or distributed queue;
- a fixed numeric cap on lanes;
- changes to Herdr itself.

## Operating topology

The steady state is:

```text
Executive tab
├── ceo
└── Discord Bridge
```

When work exists, Sandora creates this topology without taking focus:

```text
Executive tab
├── ceo
└── Discord Bridge

Departments tab (ephemeral)
├── design-lead       working or warm
├── engineering-lead  working or warm
└── design-worker-*   one bounded request
```

The tab is a layout boundary, not an authority boundary. Leads still report to
CEO and workers still report to their department lead. CEO remains the only
executive coordinator.

## Lifecycle

Department leads use these states:

```text
offline → starting → working → warm → offline
                    ↘ blocked | recovering
```

- `offline`: no pane exists; the durable registry entry remains.
- `starting`: the supervisor is creating or reconnecting the tab and pane.
- `working`: one or more active requests are assigned.
- `warm`: no active request remains and `warmUntil` is set to ten minutes after
  completion.
- `blocked`: Owner input, approval, or another explicit dependency is required.
- `recovering`: execution or delivery state is ambiguous and requires evidence
  inspection.

`blocked` and `recovering` never expire automatically. A follow-up assigned to a
warm lead changes it to `working` and clears the old lease. Completion creates a
new lease from the new completion time.

## Components

### Department tab manager

The tab manager owns one tab labeled `Departments`. It finds an existing
supervisor-owned tab or creates one with `herdr tab create --no-focus`. It uses
explicit tab and pane IDs for every split and never relies on UI focus.

The initial shell pane returned by tab creation becomes the first department
lead pane; the manager does not leave an anchor shell consuming a column.
Additional leads split an explicit pane in that tab. When one final lead remains
and passes closure gates, the manager closes the owned tab directly instead of
trying to create an impossible empty tab.

The manager records tab ownership before starting agents. It may close only a
tab it created and only after every remaining pane is supervisor-owned and safe
to close. It never closes the Executive tab, CEO pane, Discord Bridge pane, or
an unknown user pane.

### Department supervisor

`ensureLead(department)` replaces unconditional startup reconciliation. It
serializes startup by department, reuses a live working or warm lead, reconnects
a verified persisted lead, or creates a new lead in the `Departments` tab.

Startup reconciliation requires CEO but treats offline departments as healthy.
It recovers only leads with active, blocked, or recovering durable work. It does
not start an offline or expired warm lead merely because the bridge restarted.

### Warm lease manager

The lease manager records `lastUsedAt` and `warmUntil` and performs a lightweight
sweep every 30 seconds. Tests use an injected clock; production code does not
sleep while holding a request or department lock.

The sweep closes a lead only when all closure gates pass. Routine sweep checks
do not emit Discord events.

### Durable registry

Lead registry entries add:

- `tabId`;
- `supervisorOwned`;
- `lastUsedAt`;
- `warmUntil`.

Durable request and outbox state remain authoritative for work completion. A
registry lease alone can never prove that a request is safe to terminate.

## Request flow

1. Discord admits and persists an Owner request, then sends the normal receipt.
2. The channel router selects the department.
3. The supervisor acquires the department lock and calls `ensureLead`.
4. If necessary, runtime routing selects a healthy, entitled CMDC or raw AGY
   model for the task; the tab manager creates `Departments` without focus and
   starts the stable lead there.
5. The request follows the existing durable dispatch protocol.
6. Completion and durable output release the assignment.
7. A lead enters `warm`; a worker closes after its artifact or handoff is
   accepted.
8. A follow-up during the lease reuses the same lead and resets the lease after
   completion.
9. A sweep closes an expired, safe lead. The final pane cleanup closes the tab.

When a busy lead receives an independent request, existing worker-routing rules
still apply. The worker starts in `Departments`, owns one request, and is not
kept warm.

## Runtime routing

CEO remains the only Sol session. Department identity is logical and is not
bound to one provider. A cold department start routes from the admitted task:

- bounded finance, operations, extraction, and formatting start with verified
  CMDC Go candidates such as `gpt-5.6-luna`;
- large-context engineering or repository work may use a live-eligible CMDC
  Kimi or GLM coding model;
- Google-oriented product, design, research, or independent provider work may
  use time-boxed raw AGY when the local launch and prompt check succeed;
- a raw-provider failure uses the least costly verified non-Sol fallback that
  can still meet acceptance criteria, normally Codex Luna or Terra.

Every cold start checks live availability. A model listed by CMDC but rejected
by the Owner's Go entitlement is ineligible. AGY remains raw-pane controlled
until its canonical Windows adapter is healthy. A warm lead retains its current
runtime for conversational continuity; a materially incompatible follow-up
closes or hands off rather than switching provider inside the active session.
Runtime, model, fallback, and observed failure are persisted per assignment.

## Closure gates and races

A lead may close only when all conditions are true:

- the warm lease has expired;
- no active request is assigned;
- no handoff awaits acceptance;
- no approval or Owner reply is pending;
- lifecycle is neither `blocked` nor `recovering`;
- material artifacts and output are durable;
- the pane and tab are still verified as supervisor-owned.

Assignment, lease transition, and cleanup share the existing per-department
lock. A task arriving during cleanup either reuses the still-live lead or waits
for cleanup and starts one replacement. It cannot create two stable leads or
execute the request twice.

Tab cleanup uses a separate tab-level lock. The manager rechecks live panes
after acquiring that lock, so one department cannot close the tab while another
department is starting.

## Health and observability

Offline departments are normal, not degraded. Startup health reports:

```text
CEO ready · 2 active · 1 warm · 3 offline
```

`#agent-activity` may publish only material lifecycle transitions:

- department started on demand;
- warm lead reused;
- lead entered warm state;
- lead stopped after lease expiry;
- ephemeral Departments tab opened or closed when useful for the demo.

`#system-log` receives tab creation or closure failures, ownership mismatches,
ambiguous recovery, and permanent cleanup failure. It does not receive sweep
heartbeats or expected offline states.

## Failure and recovery

- Tab creation failure: preserve the request as pending and retry under existing
  bounded pre-dispatch rules; never spawn into the Executive tab as fallback.
- Lead startup failure: close only the newly created supervised pane, preserve
  state, and apply the existing runtime fallback or error path.
- Bridge restart: reconnect active, blocked, and recovering leads; leave safe
  offline departments offline.
- Cleanup failure: retain registry ownership and retry later; do not claim the
  pane closed.
- Unknown pane in `Departments`: stop automatic tab closure and publish a
  system warning for manual inspection.
- Ambiguous request completion: move to `recovering`; suppress TTL cleanup.
- Herdr outage: continue durable Discord admission and defer execution.

## Migration

On first rollout, the five currently idle persistent leads become warm with a
lease starting at migration time. Leads with active, blocked, or recovering work
retain that state. Safe idle leads close after ten minutes through the same
closure gates used in normal operation.

The migration never closes panes immediately, never moves unknown panes, and
never reconstructs work from terminal transcript alone. Once the final migrated
lead closes, the old seven-column layout disappears and later work uses the new
ephemeral tab.

## Acceptance criteria

1. A clean startup contains only CEO and Discord Bridge.
2. A Design request creates `Departments` and `design-lead` without changing
   focus.
3. A follow-up within ten minutes reuses the same pane.
4. Completion resets the lease from the latest completion time.
5. An expired safe lead closes and the final lead closes the tab.
6. Blocked or recovering work survives every cleanup sweep.
7. Concurrent startup attempts create one stable department lead.
8. A task arriving during cleanup is neither lost nor executed twice.
9. Workers close after durable handoff while the lead remains warm.
10. Bridge restart does not create five unnecessary leads.
11. A tab containing an unknown pane is never closed automatically.
12. Startup and Discord logs treat offline departments as healthy and avoid
    sweep spam.
13. Existing always-on leads drain through the migration without interrupting
    active work.

Unit tests use fake Herdr tab/pane controls, an injected clock, and durable store
fixtures. Integration tests verify explicit tab IDs, no-focus creation, locking,
restart recovery, worker cleanup, migration, and ownership failures. A private
Discord smoke test verifies cold start, warm reuse, TTL cleanup, tab teardown,
and a follow-up after cold shutdown.

## Rollout

Implementation proceeds behind a configuration switch. Tests and controlled
Herdr validation run before enabling demand-driven mode. After activation, the
current leads drain through migration. Rollback disables demand-driven cleanup
and preserves every live pane; it does not recreate missing leads until the
operator explicitly chooses the previous topology.
