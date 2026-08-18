# Sandora — Risks & Guardrails

## 1. Greenfield drift

Agent có xu hướng tự thiết kế architecture mới vì dễ reasoning hơn.

Guardrail:

> Before new code, inspect cloned upstream code.

Không chấp nhận duplicate implementation của provider, agent loop, workflow engine, memory, MCP hoặc task engine nếu upstream đã có.

## 2. Deep fork

Reuse không đồng nghĩa copy mọi thứ vào Sandora.

Guardrail:

- Hermes: fork/custom trực tiếp nhưng giữ core gần upstream.
- n8n: wrap trước, deep-fork sau nếu thật sự cần.
- OpenClaw: selective port, không runtime duplication.

## 3. License

Hermes/OpenClaw và n8n có license khác nhau.

Không giả định “public source = unrestricted reuse”.

Giữ provenance/license notices khi copy/port code.

Review lại terms trước commercial distribution.

## 4. Dependency bloat

Clone repo để inspect không có nghĩa Sandora phải import toàn bộ repo.

Chỉ đưa dependency/module vào product khi cần cho runtime.

## 5. Scope creep

Nếu capability không cần để core E2E pass → defer.

## 6. Fake completeness

Không build screen giả cho capability chưa wired.

Một flow thật có giá trị hơn mười module mock.
