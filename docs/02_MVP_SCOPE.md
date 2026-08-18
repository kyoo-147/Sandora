# Sandora — MVP Scope

## Mục tiêu

Có một Sandora desktop usable trong 1–2 ngày bằng cách **custom Hermes thay vì xây mới**.

MVP core flow:

```text
provider setup
→ chat
→ specialist agent
→ task
→ real result
```

## Must-have

### Provider setup

Reuse provider/model setup từ Hermes.

Không viết provider abstraction mới.

### Chat

Reuse Hermes session/chat/streaming/tool output.

Custom UX nếu cần.

### Agents

Reuse Hermes Profiles/Bot Mode.

Reframe thành:

- Chief of Staff
- Researcher
- Operator

Creation mặc định:

```text
Name
Role
Model: Auto
```

Advanced settings chỉ mở khi user cần.

### Work

Reuse Hermes task/Kanban primitives.

Custom UI thành Work.

### Automation

Chỉ sau khi core flow Done.

Reuse n8n.

Không xây workflow engine.

MVP bridge chỉ cần:

- health;
- open;
- run.

## Explicitly NOT in MVP

- custom agent runtime;
- custom memory system;
- custom MCP framework;
- custom provider router;
- custom workflow engine;
- company hierarchy;
- department builder;
- meetings;
- analytics;
- CRM subsystem;
- full approval center;
- multi-user RBAC;
- SaaS architecture.

## Definition of Done

1. Hermes-derived Sandora desktop chạy thật.
2. Provider setup thật.
3. Chat thật.
4. Agent thật.
5. Task/result thật.
6. Persistence thật.
7. Critical path không mock.
8. E2E core flow pass.
9. Không có subsystem lớn bị viết lại nếu upstream đã có equivalent.
