# Sandora — Build Plan

## Phase 0 — Clone before code

Trước khi viết Sandora:

```text
clone Hermes
clone n8n
clone OpenClaw
```

Run/build được Hermes trước.

Inspect:

- app shell;
- provider setup;
- session/chat;
- agent/profile;
- tasks;
- tools/MCP;
- persistence;
- automation extension points.

Inspect n8n/OpenClaw theo capability gap.

Không spend nhiều giờ viết architecture document. Audit đủ để reuse rồi implement ngay.

## Hour 0–2

- clone three upstream repos;
- fork Hermes thành Sandora base;
- run Hermes;
- record upstream commit;
- identify exact reusable modules;
- rename minimal brand/package/window;
- verify chat baseline.

## Hour 2–6

- strip Hermes navigation;
- Chat = Home;
- Bot/Profile → Agent;
- add 3 presets;
- simplify agent creation;
- reuse provider onboarding.

## Hour 6–12

- Kanban → Work;
- connect task → agent → result;
- persistence;
- remove mock from critical path;
- E2E.

## Hour 12–24

- fix real blockers;
- onboarding/error handling;
- restart/recovery;
- dogfood.

Do not touch n8n if core loop is not Done.

## Hour 24–48

Only after core loop:

- add AutomationAdapter;
- wire local n8n;
- open/run workflow;
- prove one real automation.

OpenClaw code is only pulled in when a concrete Hermes gap exists.

## Day 3–7

- packaging/reliability;
- automation presets;
- selective security/permission improvements;
- repeated-task/routine UX;
- dogfood;
- remove unused features.

Each new feature must first ask:

> Can this be enabled by code we already cloned?
