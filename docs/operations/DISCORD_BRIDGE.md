# Discord bridge operating protocol

## Purpose

The Discord bridge admits messages from the configured Owner in `#ceo-office`
and five department channels. It routes work to six persistent Herdr leads,
creates bounded elastic workers when a lead is occupied, and delivers durable
outbox messages to configured Discord channels.

Discord is a communication surface. It does not create agents, expand CEO
authority, or bypass Herdr, approval boundaries, evidence requirements, or the
project's read-only defaults for answer and diagnosis requests.

## Inbound protocol

The bridge accepts a message only when all of these match the checked-in
non-secret configuration:

- Discord server ID;
- Owner user ID;
- a configured CEO or department task-channel ID;
- non-bot author.

Task channels route to `ceo`, `product-lead`, `design-lead`,
`engineering-lead`, `finance-lead`, or `operations-lead`. Output-only channels,
`#general`, and `#tech-company` never admit tasks.

The bridge writes an immutable JSON record under
`demo-company/workspace/inbox/` before acknowledging or prompting CEO. Duplicate
Discord message IDs are ignored. Per-request state under `workspace/status/`
supports bounded retry after a pre-dispatch failure or restart. Once the Herdr
prompt command starts, a timeout is ambiguous: the request moves to `submitted`,
automatic replay stops, and `#system-log` requests manual inspection. This
avoids executing the same Owner task twice. Delivery is otherwise at-least-once:
CEO must use the request ID to detect a replay after a crash at the boundary
between Herdr completion and state persistence. The prompt begins
with `[DISCORD_TASK]` for CEO or `[DISCORD_DEPARTMENT_TASK]` for a department.
It includes the inbox path, department profile, assigned agent, role, and reply
channel without embedding the Owner's task body.

Attachments are recorded as Discord metadata and expiring URLs in the initial
bridge version. A task requiring durable attachment access must download or
copy the authorized asset into a scoped project path before the URL expires.

## CEO handling

For a `[DISCORD_TASK]` prompt:

1. Read the inbound JSON record and identify the affected project.
2. Apply normal progressive disclosure and approval boundaries.
3. Decide the smallest sufficient Herdr task graph.
4. Send meaningful progress only when it helps the Owner understand a material
   state change, blocker, approval request, or result.
5. Before stopping, enqueue at least one final, approval, or error message.

The bridge sends the initial receipt acknowledgement automatically.

## Department handling

Persistent leads may answer bounded specialist work directly. They use a
durable handoff when another department or CEO must own the next step. Work that
is cross-functional, approval-gated, destructive, production-facing,
credential-sensitive, financially committing, or governance-changing must
escalate to CEO.

An elastic worker owns one request, cannot claim lead or CEO authority, cannot
create agents, and must not post an unreviewed final answer. It writes a durable
artifact and hands that evidence back to the stable lead:

```powershell
npm --prefix integrations/discord-bridge run handoff -- `
  --parent-request-id <request-id> `
  --to design `
  --from design-worker-01 `
  --summary "Visual review complete" `
  --artifact demo-company/workspace/reports/<artifact>.md
```

The handoff becomes a new durable request with the original source/reply
channel and parent request ID. Handoffs queue to a stable lead instead of
creating recursive workers.

## Outbox command

Write a report or response artifact first when the content is substantial, then
enqueue it from the repository root:

```powershell
npm --prefix integrations/discord-bridge run outbox -- `
  --request-id <request-id> `
  --channel ceo-office `
  --kind final `
  --author ceo `
  --content-file demo-company/workspace/reports/<report>.md
```

For a short update, use `--content` instead of `--content-file`. Allowed kinds
are `update`, `final`, `report`, `approval`, and `error`. Allowed channel aliases
are defined in `integrations/discord-bridge/config/discord.json`.

To attach repository-local images, add a semicolon-separated `--attachments`
value. Paths are constrained to the repository, image extensions, 10 files, and
10 MiB per file:

```powershell
npm --prefix integrations/discord-bridge run outbox -- `
  --request-id <request-id> --channel design --kind final --author ceo `
  --content "Approved design references." `
  --attachments "designs/landing_1.png;designs/landing_2.png"
```

Stable department leads may post reviewed specialist results directly to their
own source channel. Workers report through durable handoffs. CEO owns
cross-functional synthesis and may publish consolidated output to
`#executive-reports`.

Lead and CEO outbox messages use channel-scoped Discord webhooks so the visible
author and avatar match the responsible persona. The bot needs `Manage
Webhooks` in task and report channels. Avatar PNGs and the author mapping live
under `integrations/discord-bridge/assets/personas/` and `config/discord.json`.
Inbound receipts and system events remain under the primary application bot.

`#agent-activity` contains curated accepted, delegated, handoff, blocked, and
completed transitions. `#system-log` contains redacted health transitions,
warnings, and errors. Neither channel may contain task bodies, prompts,
transcripts, credentials, or full stack traces.

## Scheduled tasks

Schedules are configured in
`integrations/discord-bridge/config/schedules.json`. Jobs are disabled until a
live smoke test passes and the Owner approves activation. A scheduled job enters
the same durable inbox and CEO workflow as an Owner message; the scheduler does
not generate reports itself.

## Secret and launch boundary

- Never commit, log, or paste the Discord bot token into chat.
- A token exposed in any transcript must be reset before use.
- Start the bridge from a dedicated Herdr pane with
  `integrations/discord-bridge/start-discord-bridge.ps1`.
- The startup script reads a reset token through hidden input and removes it
  from the environment when the process stops.
- Do not grant the bot Administrator permission.

## Recovery

- An inbox record remains available if Herdr dispatch fails. A missing state
  record is reconstructed as pending. Pre-prompt failures retry with exponential
  backoff up to the configured attempt limit; ambiguous post-prompt failures do
  not replay automatically.
- Pending outbox messages persist retry count, next-attempt time, and the next
  unsent chunk. They move to `sent/` only after Discord confirms every chunk.
- Transient Discord failures retry with exponential backoff. Records move to
  `failed/` only after the configured attempt limit, with the reason preserved.
- Restarting the bridge recovers pending inbox and outbox work and ignores
  completed Discord message IDs.
- Submitted, working, or blocked requests are inspected for a live assigned
  agent, durable outbox result, or handoff. They are never automatically
  replayed. Missing evidence becomes a manual-recovery event.
- One workspace permits only one bridge writer. A process lock prevents two
  bridge instances from claiming the same request.
