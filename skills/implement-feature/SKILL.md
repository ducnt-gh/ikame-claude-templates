---
name: implement-feature
description: Full feature implementation — tech lead planning → user confirmation → parallel agents → review → QA → browser verify → done
---

# Skill: Implement Feature

Workflow triển khai tính năng đầy đủ với multi-agent coordination. KHÔNG bỏ qua bước xác nhận với user.

## Phase 1 — Tech Lead Analysis

Dùng agent **tech-lead** để:
1. Đọc toàn bộ codebase liên quan
2. Lập kế hoạch chi tiết (backend/frontend/database/devops tasks)
3. Xác định dependencies giữa các tasks

## Phase 2 — User Confirmation (KHÔNG được bỏ qua)

Trình bày với user:
- Implementation plan từ tech-lead
- Các quyết định kiến trúc và trade-offs
- Câu hỏi cần làm rõ

**Chờ user approve trước khi tiếp tục.**

## Phase 3 — Task Scope Assessment

Sau khi user approve, đánh giá độ lớn của tính năng:

### Tính năng nhỏ / ≤ 4 bước
- Dùng `TaskCreate` để track từng bước trong session hiện tại
- Thực hiện trực tiếp theo plan

### Tính năng lớn / ≥ 5 bước / build cả dự án
- **Tạo Goal** bằng cách ghi file `~/.claude/ikame-goal-request.json`:

```json
{
  "title": "Tên tính năng ngắn gọn (max 60 chars)",
  "description": "Mô tả tính năng và lý do triển khai",
  "steps": [
    { "description": "Bước 1 cụ thể" },
    { "description": "Bước 2 cụ thể" }
  ]
}
```

- Extension tự động tạo Goal và hiển thị trong Goals panel
- **Cập nhật progress** sau mỗi bước hoàn thành bằng cách ghi `~/.claude/ikame-goal-update.json`:

```json
{
  "goalTitle": "Tên tính năng (phải khớp với title đã tạo)",
  "steps": [
    { "description": "Bước 1", "status": "completed" },
    { "description": "Bước 2", "status": "active" },
    { "description": "Bước 3", "status": "pending" }
  ]
}
```

- **KHÔNG** ghi lại `ikame-goal-request.json` để update — chỉ dùng file đó để tạo goal mới
- **Lý do dùng Goals thay vì TaskList:** Goals persist qua nhiều sessions. Khi context bị compact hoặc session mới, goal vẫn còn và Claude có thể resume từ đúng bước đang dở

## Phase 4 — Parallel Implementation

Spawn đồng thời (dùng nhiều Agent tool calls):

- **database-engineer**: Thiết kế schema, migration files
- **backend-dev**: Implement API endpoints, unit tests
- **frontend-dev**: Implement UI, component tests
- **devops** (nếu cần): Chuẩn bị deployment config

database-engineer nên chạy trước hoặc đồng thời với backend-dev.

## Phase 5 — Code Review (Song song)

- **code-reviewer**: Review quality, bugs, maintainability
- **security-reviewer**: Security audit, OWASP Top 10

Fix tất cả Critical và Major issues.

## Phase 6 — QA Testing

- **qa-engineer**: Unit + integration + E2E tests, edge cases

Fix tất cả failing tests.

## Phase 7 — Browser Verification

1. Bật Browser tool
2. Navigate đến feature
3. Test golden path + edge cases
4. Check responsive mobile
5. Screenshot kết quả

## Phase 8 — Fix & Finalize

Fix issues từ review, test, browser check. Re-run tests.

## Phase 9 — Report

Báo cáo: files thay đổi, tests passing, screenshots, known limitations.
