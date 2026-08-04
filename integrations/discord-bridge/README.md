# Sandora Discord bridge

This local bridge connects the private Kite & Kiln Discord server to the live
Herdr workspace. It accepts only the configured Owner in the CEO and five
department channels, stores each message before dispatch, and routes it to the
matching persistent lead. Durable outbox records return to Discord with local
image attachments and per-agent webhook personas when configured.

## Security model

- The bot token is never stored in this repository.
- The checked-in configuration contains only Discord IDs and the public key.
- Server, Owner, and inbound-channel allowlists are mandatory.
- Scheduled jobs are disabled until live validation succeeds.
- Discord does not broaden CEO authority or approval boundaries.

The token previously exposed in chat must be reset and must never be used.

## Install and validate

```powershell
Set-Location D:\working\Sandora\integrations\discord-bridge
npm install
npm test
npm run check
npm run build
```

## Run

Start a dedicated shell pane inside the same Herdr workspace, then run:

```powershell
.\integrations\discord-bridge\start-discord-bridge.ps1
```

Enter the reset token at the hidden prompt. The bridge posts its ready state to
`#system-log`. Send a message from the configured Owner account in
`#ceo-office`; messages from other users, servers, channels, and bots are
ignored.

For distinct CEO and department identities, grant the bot `Manage Webhooks` in
the six task channels. Persona names and PNG avatars are defined in
`config/discord.json` and `assets/personas/`.

## Outbox

CEO and its scoped agents follow `docs/operations/DISCORD_BRIDGE.md`. A typical
final response is queued with:

```powershell
npm --prefix integrations/discord-bridge run outbox -- `
  --request-id discord-123 `
  --channel ceo-office `
  --kind final `
  --author ceo `
  --content-file demo-company/workspace/reports/discord-123.md
```

## Stop and recover

Press Ctrl+C in the bridge pane. Inbox records remain durable. Successful
outbox records are under `outbox/sent`; failed records preserve the delivery
reason under `outbox/failed`.
