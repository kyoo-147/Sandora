# On-demand departments implementation

- Status: active
- Started: 2026-08-04
- Branch: `feat/on-demand-departments`
- Design authority:
  `docs/superpowers/specs/2026-08-04-on-demand-departments-design.md`

## Outcome

Keep only CEO and Discord Bridge permanently visible. Start department leads in
one no-focus `Departments` tab when work arrives, reuse them for a ten-minute
warm window, and close safe expired leads and the empty tab automatically.

## Boundaries

- Preserve the running bridge until replacement rollout is validated.
- Use only Herdr for additional agent sessions.
- Never close CEO, Bridge, unknown, blocked, or recovering panes.
- Durable request/outbox evidence overrides registry lease state.
- Keep schedules disabled.
- Reserve Sol for CEO; route non-CEO cold starts dynamically through verified
  CMDC/AGY candidates with a non-Sol fallback.

## Work plan

- [x] Extend config and registry schema for demand-driven topology and leases.
- [x] Add explicit Herdr tab management and ownership verification.
- [x] Refactor supervisor startup, on-demand lead creation, reuse, and locks.
- [x] Extend dynamic runtime routing from workers to cold department leads.
- [x] Add warm lease sweeper, cleanup gates, and worker teardown behavior.
- [x] Wire bridge startup, health, shutdown, migration, and observability.
- [x] Update CLI and operating documentation.
- [x] Add deterministic unit and integration coverage.
- [ ] Run full validation and independent Herdr review.
- [ ] Roll out migration and verify Executive/Departments topology live.

## Validation record

Pending.

## Result

Pending.
