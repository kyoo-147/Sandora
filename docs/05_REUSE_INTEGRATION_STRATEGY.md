# Sandora — Reuse & Integration Strategy

## Hard rule

**Không được bắt đầu implementation từ blank architecture.**

Việc đầu tiên là clone:

```bash
git clone https://github.com/nousresearch/hermes-agent
git clone https://github.com/n8n-io/n8n
git clone https://github.com/openclaw/openclaw
```

Sau đó inspect source và lập reuse map ngắn.

## Reuse hierarchy

```text
1. keep existing code
2. configure existing code
3. restyle/relabel existing UI
4. wrap existing module
5. extend existing module
6. port focused code from another upstream
7. write new code
```

Mức 7 chỉ dùng khi 1–6 không đáp ứng outcome.

## Hermes — primary foundation

Reuse/fork:

- desktop shell;
- provider configuration;
- chat/session runtime;
- agent loop;
- profiles/bots;
- memory;
- skills;
- MCP;
- tools;
- cron;
- Kanban/tasks;
- preview/files/tool output;
- persistence/runtime lifecycle nếu phù hợp.

Custom:

- brand;
- navigation;
- agent presets;
- simplified UX;
- Work semantics;
- Sandora-specific onboarding.

Không rewrite Hermes core nếu không có blocker kỹ thuật rõ ràng.

## n8n — automation engine

Clone để inspect source và capability.

Reuse/wrap:

- workflow execution;
- integrations;
- triggers;
- credentials;
- workflow editor khi cần.

MVP không fork sâu n8n.

Ưu tiên:

```text
Sandora
→ thin AutomationAdapter
→ n8n local API/webhook/process
```

Chỉ mở n8n UI khi user cần advanced automation.

## OpenClaw — selective source reuse

Clone để inspect.

Không dựng một OpenClaw runtime song song.

Tìm và port/selectively adapt nếu cần:

- permission model;
- tool execution safeguards;
- sandbox helpers;
- gateway patterns;
- approval patterns;
- runtime utilities.

Nếu Hermes đã có equivalent tốt, giữ Hermes.

## Decision matrix

| Capability | Source | Action |
|---|---|---|
| Desktop | Hermes | Fork/custom |
| Chat | Hermes | Reuse |
| Providers | Hermes | Reuse |
| Agent loop | Hermes | Reuse |
| Memory | Hermes | Reuse |
| Skills/MCP/tools | Hermes | Reuse |
| Tasks | Hermes | Reuse/custom |
| Cron | Hermes | Reuse |
| Automation engine | n8n | Wrap |
| Integration catalog | n8n | Reuse |
| Workflow editor | n8n | Open/embed later |
| Permissions | Hermes first / OpenClaw gap | Reuse/port |
| Sandbox | Hermes first / OpenClaw gap | Reuse/port |
| Product UX | Sandora | Build/custom |
| Presets | Sandora | Build |

## Greenfield prevention

Nếu Captain định viết mới một subsystem > khoảng vài trăm dòng, phải tự kiểm tra trước:

- Hermes có equivalent không?
- n8n có equivalent không?
- OpenClaw có equivalent không?
- Có thể giải quyết bằng adapter/configuration không?

Không cần hỏi CEO để reuse code phù hợp.

Nếu vẫn phải viết mới, Captain tự ghi justification ngắn trong code/PR notes.
