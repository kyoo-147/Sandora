# Sandora

## Snapshot

- Status: active bootstrap
- Owner: user
- Primary agent: CEO, acting as Chief of Staff
- Local root: `D:\working\Sandora`
- Last reviewed: 2026-08-03

## Objective

Create a CLI-operated AI department whose primary executive agent understands
the Owner's objective, manages project context progressively, and coordinates
additional main-agent sessions through Herdr.

## Current scope

- Persistent CEO identity and operating rules.
- Progressive project-memory structure.
- Herdr-only agent coordination.
- Runtime and model routing based on verified availability and measured
  capability.

Dashboards, SaaS architecture, visual workflow builders, integrations, and
industry templates are outside the current implementation scope.

## Authority

Read in this order and stop when the task has enough context:

1. `identity.md` — executive identity and reporting line.
2. `docs/sandora_spec.md` — current organizational operating specification.
3. `docs/operations/HERDR.md` — agent/session coordination.
4. `docs/operations/MODEL_ROUTING.md` — runtime and model selection.
5. `projects/sandora/RUNTIME_CAPABILITIES.md` — current local health,
   entitlement, and control evidence.
6. Current code, tests, run output, and Git diff when implementation exists.

`README.md` and visual assets are product background, not current CLI scope,
unless the Owner explicitly brings them into a task.

## Current decisions

- Codex native multi-agent tools are disabled at project scope.
- All delegated agents are peer main-agent sessions controlled through Herdr.
- When the Owner omits runtime/model selection, CEO routes automatically from
  verified task fit, health, entitlement, and cost evidence.
- Project knowledge is project-native and progressively disclosed.

## Open questions

- The concrete Sandora CLI command surface and persistence format are not yet
  specified.
- Runtime capability profiles still need real benchmark runs inside Herdr.
- Approval and durable-memory write formats will be refined as implementation
  begins.
