# Sandora Operating Pack v2

## Mục đích

Bộ tài liệu này điều hành Sandora theo nguyên tắc:

> **Clone first. Reuse first. Customize existing code. Build from scratch only as a last resort.**

Sandora không được phát triển như một project greenfield nếu Hermes, n8n hoặc OpenClaw đã có code giải quyết vấn đề tương ứng.

## Bắt buộc trước khi implementation

Captain phải clone và inspect cả ba repository:

```text
upstream/
  hermes-agent/
  n8n/
  openclaw/
```

Sau đó mới tạo/fork product workspace của Sandora.

Mục đích:

- Hermes: foundation chính để fork và custom trực tiếp.
- n8n: reuse workflow/integration engine thay vì tự xây automation platform.
- OpenClaw: reuse/port selectively các runtime/security/tooling patterns hữu ích thay vì tự phát minh lại.

Không được đọc README rồi tự implement lại bằng trí nhớ. Phải inspect source code thực tế trước.

## Product thesis

> Sandora is the simplest way to put a team of AI agents to work.

User flow:

> Plug in a provider → tell Sandora what needs to get done → agents execute.

## Thứ tự ưu tiên implementation

1. Reuse code nguyên trạng nếu phù hợp.
2. Wrap/adapt code hiện có.
3. Port một module nhỏ từ upstream.
4. Customize existing module.
5. Chỉ viết mới khi không có primitive phù hợp.

Nếu một task có thể hoàn thành bằng 100 dòng adapter thay vì 2.000 dòng subsystem mới, phải chọn adapter.

## Tài liệu

1. `01_PRODUCT_DIRECTION.md`
2. `02_MVP_SCOPE.md`
3. `03_ARCHITECTURE.md`
4. `04_UX_PRODUCT_RULES.md`
5. `05_REUSE_INTEGRATION_STRATEGY.md`
6. `06_BUILD_PLAN.md`
7. `07_RISKS_GUARDRAILS.md`
8. `08_CAPTAIN_EXECUTION_PROMPT.md`
9. `09_TASK_BRIEF_TEMPLATE.md`

Không biến các file này thành backlog chi tiết. Captain tự triển khai implementation details.
