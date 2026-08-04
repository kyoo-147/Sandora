# Discord to CEO bridge

- Project: Sandora and Kite & Kiln demo company
- Owner: user
- Status: completed
- Started: 2026-08-04
- Last updated: 2026-08-04

## Outcome

The Owner can send a task in the private Discord `#ceo-office` channel, the
message is durably admitted to Sandora, the live Herdr session named `ceo`
receives it, and verified CEO or department updates can be posted back to the
configured Discord channels. Scheduled reports use the same durable path.

## Scope

In scope: a local Node.js bridge, Discord Gateway connection, strict Owner and
channel allowlists, durable inbox/outbox records, Herdr prompt dispatch,
scheduled task admission, department-channel routing, safe secret entry, tests,
and operating documentation.

Out of scope: a web UI, public bot distribution, production deployment,
multi-tenant support, autonomous consequential actions, and storing Discord
credentials in Git.

## Context and authority

- `identity.md`
- `AGENTS.md`
- `docs/operations/HERDR.md`
- `docs/operations/MODEL_ROUTING.md`
- `demo-company/PROJECT.md`
- Discord application and channel IDs supplied by the Owner
- Discord official Gateway, bot, permissions, and command documentation

## Workstreams and dependencies

- `ceo`: architecture, implementation, credential boundary, and integration.
- A Herdr peer review may inspect security and failure behavior after the bridge
  compiles; it may not use credentials or contact Discord.
- Live smoke testing depends on the Owner resetting the exposed token, adding
  the bot to the server, and entering the new token locally through the hidden
  startup prompt.

## Approval gates, risks, and recovery

- The previously pasted bot token is compromised and must never be used.
- A new token remains outside the repository and conversation.
- Only the configured Owner ID and CEO channel may admit tasks.
- Discord messages cannot authorize destructive, financial, production,
  credential, governance, or materially expanded actions without explicit
  Owner approval under existing policy.
- Inbox and outbox records are append-only during normal operation. Failed
  delivery remains retryable and must not be silently marked sent.
- External posting occurs only during the Owner-authorized live smoke test or
  normal bridge operation after configuration.

## Progress

- [x] Record non-secret Discord application, server, Owner, and channel IDs.
- [x] Implement local bridge and durable message protocol.
- [x] Implement hidden token startup and configuration validation.
- [x] Add unit tests and compile validation.
- [x] Run live Discord smoke test.
- [x] Record operating and recovery instructions.

## Decisions

- Accepted: Discord is the messaging surface for the demo.
- Accepted: the bridge runs from a Herdr-managed pane.
- Accepted: initial inbound task admission is limited to the Owner and
  `#ceo-office`.
- Accepted: internal agents remain main sessions in Herdr; Discord is a
  communication surface, not an agent runtime.
- Accepted: scheduled reports enter through the same CEO task protocol.

## Validation

The reset token was entered locally and never persisted. Live Discord admission,
Herdr dispatch, durable outbox delivery, department routing, and repository-local
image attachment delivery have been observed. TypeScript check and build pass;
the expanded suite has 55 passing tests across nine files. Independent Herdr
review found and rechecked the inbox crash window and ambiguous Herdr prompt
replay boundary. The protocol favors no duplicate Owner-task execution after the
durable `submitted` boundary; a crash immediately before OS prompt launch still
requires manual recovery. Persona webhook delivery is a later extension and is
waiting only for the bot's channel-level `Manage Webhooks` permission.

## Result

The Owner can submit Discord tasks to the live CEO bridge and receive durable
responses. Department routing, attachments, personas, and schedules continue
under the separate always-on departments plan.
