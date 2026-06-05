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

### Tính năng nhỏ / ít task
- Tạo TaskList thông thường (tool `TaskCreate`) để track từng bước
- Thực hiện trực tiếp theo plan

### Tính năng lớn / nhiều agent / build cả dự án
- **Tạo file tasklist** lưu tại thư mục gốc của project:
  - Tên file: `plan-{tên_tính_năng_hoặc_dự_án}.md`
  - Ví dụ: `plan-build_auth_system.md`, `plan-refactor_dashboard.md`
- Format file:

```markdown
# Plan: {Tên tính năng}

## Tasks

- [ ] Task 1: ...
- [ ] Task 2: ...
- [ ] Task 3: ...
...

## Notes
- Ghi chú thêm về dependencies, decisions, v.v.
```

- **Lý do dùng file thay vì TaskList tool:** Khi context window đầy và bị compact, file vẫn tồn tại trên disk. Lần sau mở lại, Claude đọc file này để biết đang làm đến đâu.
- **Quy tắc cập nhật:** Làm xong task nào → ngay lập tức cập nhật `- [ ]` thành `- [x]` trong file đó. Không batch update.

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
