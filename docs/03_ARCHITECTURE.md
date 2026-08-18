# Sandora — Architecture

## Workspace

Khuyến nghị:

```text
sandora-workspace/
  upstream/
    hermes-agent/
    n8n/
    openclaw/

  sandora/
    desktop/
    shared/
    adapters/
    presets/
```

Có thể thay đổi layout theo repo thực tế, nhưng phải giữ ba upstream source tree dễ inspect/diff.

## Runtime architecture

```text
Sandora UI
   │
   ▼
Hermes-derived Desktop / Web Client
   │
   ▼
Hermes Runtime
   ├── Sessions
   ├── Providers
   ├── Profiles/Bots
   ├── Memory
   ├── Skills / MCP
   ├── Tools
   ├── Cron
   └── Tasks/Kanban
          │
          └── AutomationAdapter
                    │
                    ▼
                   n8n
```

OpenClaw không nằm trong default runtime graph.

Module từ OpenClaw chỉ được port/reuse khi có gap cụ thể.

## Architecture rule

Trước khi tạo một package/service/module mới, Captain phải search cả:

- Sandora/Hermes base;
- n8n;
- OpenClaw.

Nếu upstream đã có primitive phù hợp:

> adapt it, wrap it, or port it.

Không tự tạo một hệ thống song song chỉ vì viết mới dễ hiểu hơn.

## Desktop

Fork/custom Hermes Desktop.

Không dựng Electron/Tauri shell mới trừ khi Hermes architecture thực tế không usable.

## Web

Tận dụng shared UI/client/runtime abstractions từ Hermes/Sandora.

Không tạo một product codebase hoàn toàn khác cho web.

## Automation

n8n nằm sau abstraction mỏng:

```text
AutomationAdapter
  health()
  runWorkflow()
  openWorkflow()
```

Không kéo n8n domain model vào Sandora core nhiều hơn cần thiết.
