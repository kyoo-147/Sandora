# Sandora — Product Direction

## Mục tiêu

Xây một desktop-first AI work application cực kỳ đơn giản bằng cách **tái sử dụng tối đa những gì đã tồn tại**.

Không xây một agent framework mới.

Không xây một workflow engine mới.

Không xây một tool runtime mới.

Không xây một desktop shell mới nếu Hermes đã có.

## Foundation strategy

### Hermes

Hermes là codebase khởi đầu của Sandora.

Captain phải:

- clone/fork Hermes;
- chạy được Hermes nguyên bản;
- xác định các module có thể giữ nguyên;
- custom branding, navigation, presets và product semantics;
- giữ core càng gần upstream càng tốt.

Sandora nên bắt đầu như một **product fork/customization of Hermes**, không phải một app mới gọi Hermes từ xa trừ khi codebase thực tế buộc phải làm vậy.

### n8n

Clone n8n để inspect và tận dụng workflow/integration capability.

Không tự viết:

- visual workflow engine;
- execution graph;
- integration catalog;
- credential framework;

nếu n8n đã đáp ứng được.

Giai đoạn đầu ưu tiên wrap/API/webhook/sidecar thay vì deep-fork n8n.

### OpenClaw

Clone OpenClaw và inspect source.

Không chạy OpenClaw như runtime thứ hai mặc định.

Dùng OpenClaw như source pool để:

- port/selectively reuse permission patterns;
- sandbox/tool execution patterns;
- gateway/security patterns;
- useful runtime utilities;

khi Hermes chưa có capability tương ứng.

## Positioning

Hermes = execution kernel + desktop foundation.

n8n = automation engine.

OpenClaw = source of reusable runtime/security patterns.

Sandora = product UX + presets + team semantics + orchestration experience.

## Core loop

```text
Open app
→ select provider / local model
→ enter API key
→ chat
→ select/create agent
→ assign work
→ receive real result
```

Mọi feature khác phải phục vụ loop này hoặc bị defer.
