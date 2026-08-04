# Company operating workspace

This directory is the durable exchange surface for the terminal-first company
demo. Discord is the communication surface, Herdr owns agent sessions, and the
filesystem preserves task evidence across restarts.

## Runtime folders

- `inbox/`: admitted Owner messages and scheduled tasks.
- `outbox/pending/`: messages waiting for Discord delivery.
- `outbox/sent/`: successfully delivered messages.
- `outbox/failed/`: messages that could not be delivered and need recovery.
- `sessions/`: optional append-only session event logs.
- `status/`: current bridge and per-request recovery state.
- `reports/`: human-readable reports created by CEO or department agents.
- `handoffs/`: scoped handoffs between CEO and peer agents.
- `decisions/`: decisions and approval records.

Runtime JSON and JSONL files are ignored by Git. Reports, handoffs, and
decisions may be committed only when they are stable demo fixtures rather than
ephemeral session output.

The bridge uses at-least-once request delivery across the filesystem and Herdr
boundary. Every task and outbox response carries a stable request ID so CEO can
recognize a replay after an interrupted state transition.
