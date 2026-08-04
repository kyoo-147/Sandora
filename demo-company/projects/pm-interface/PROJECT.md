# Demo 2: product management and quarterly review

## Request pattern

“CEO, hãy nhắn các nhân viên tạo giao diện web PM như design và thực hiện báo
cáo các số liệu của quý này đi.”

## Outcome

Create a PM workspace that follows the supplied PM design reference and turns
the current quarter's sample data into an executive report with decisions,
risks, and next actions.

## Required context

1. `company/PROFILE.md`
2. `product/PRODUCT.md`
3. `people/TEAM.md`
4. `data/quarterly/2026-Q2.md`
5. `designs/project_management.webp`

## Core screens

- Portfolio overview: initiatives, health, owner, and next milestone
- Initiative detail: scope, progress, blockers, and evidence
- Quarterly review: metric cards, trend notes, and decisions
- Agent activity: active lanes, status, output, and approval gates

## Suggested lane graph

CEO may assign separate lanes for PM interface implementation, data validation,
metric narrative, and executive review when those outputs are independent. If
the task is tightly coupled, one implementation lane plus one review lane is
sufficient.

## Acceptance evidence

- Every displayed metric maps to `data/quarterly/2026-Q2.md`.
- Sample data is visibly labelled in the demo context.
- Filters, states, and responsive layout work without invented behavior.
- The quarterly report separates fact, interpretation, decision, and risk.
- The interface makes owner, status, and next action easy to scan.
