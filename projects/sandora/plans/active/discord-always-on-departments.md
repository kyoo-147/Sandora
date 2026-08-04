# Discord always-on departments implementation

- Status: active
- Started: 2026-08-04
- Branch: `feat/discord-always-on-departments`
- Design authority: `docs/superpowers/specs/2026-08-04-discord-always-on-departments-design.md`

## Outcome

Extend the verified CEO-only Discord bridge into six persistent Herdr leads,
department-channel routing, elastic department workers, durable handoffs, and
curated activity/system events without interrupting the currently running
bridge before rollout validation.

## Boundaries

- Preserve the Owner's existing dirty worktree and unrelated changes.
- Keep the current Discord process running until replacement startup is ready.
- Use Herdr only for additional agent sessions.
- Keep schedules disabled during implementation and smoke testing.
- Do not use exposed Discord tokens or write credentials to disk.
- Do not automatically replay work beyond the durable submitted boundary.

## Work plan

- [x] Extend configuration, types, and validation for departments and leads.
- [x] Add channel routing and department prompt envelopes.
- [x] Add durable registry, request ownership, parentage, and event records.
- [x] Add Herdr supervisor for persistent leads and elastic workers.
- [x] Add curated activity and redacted system event publishing.
- [x] Add startup reconciliation, recovery, and rollback behavior.
- [x] Add unit and integration tests for routing, state, workers, and events.
- [x] Run check, build, tests, independent review, and fault-focused validation.
- [ ] Perform staged private Discord/Herdr smoke test with Owner-visible evidence.

## Validation record

- `npm test`: 56 tests passed across nine files after attachment, persona
  delivery, and persisted CEO-name recovery were added.
- `npm run check`: passed.
- `npm run build`: passed.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Exposed-token prefix scan: no repository matches.
- Independent Herdr reviewer: GO for staged private rollout after two focused
  blocker reviews.
- Live Herdr reconciliation: `ceo` plus five department leads present; CEO was
  working and all five department leads were idle.
- Live Discord bridge: connected as `Sandora CEO#7690`; six of six persistent
  leads available; department routing and local image attachment delivery
  verified.
- Persona webhook smoke: implementation validated locally; live creation is
  verified after the bot received `Manage Webhooks`; all six persona messages
  were accepted by Discord with no pending or failed records.
- Herdr resume recovery: the live CEO name was restored from the persisted pane
  identity, four missing department leads were reconciled without duplicates,
  and a guarded automatic recovery path now has unit coverage. A future restart
  should verify that path end to end.

## Result

Pending.
