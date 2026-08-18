# Sandora — UX & Product Rules

## UX thesis

**Chat is Home.**

User không phải setup company/department/workflow trước khi có value.

```text
Open
→ Provider/API key
→ Chat
```

## Navigation

```text
Chat
Work
Automations
Settings
```

Agents ở sidebar/quick switcher.

## Reuse rule

Trước khi thiết kế hoặc code một screen mới:

1. Xem Hermes đã có screen/component nào tương đương.
2. Custom/simplify screen đó.
3. Chỉ dựng screen mới nếu không có surface phù hợp.

Không rewrite UI chỉ để “đúng brand” nếu component hiện có có thể restyle.

## Progressive disclosure

Default:

```text
Name
Role
Model: Auto
Create
```

Advanced:

```text
Instructions
Model
Skills
Tools
MCP
Permissions
```

## Không expose backend complexity

Backend có object không có nghĩa UI phải có page riêng cho object đó.

Không dựng:

- Department page
- Company setup
- Agent marketplace
- Analytics dashboard
- Approval center

trong MVP.

## Design goal

Giữ những điểm Hermes đã làm tốt về tối giản.

Sandora khác biệt bằng:

- wording;
- presets;
- workflows;
- business semantics;
- visual identity;

không phải bằng số lượng màn hình.
