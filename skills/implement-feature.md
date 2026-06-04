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

## Phase 3 — Parallel Implementation

Spawn đồng thời (dùng nhiều Agent tool calls):

- **database-engineer**: Thiết kế schema, migration files
- **backend-dev**: Implement API endpoints, unit tests
- **frontend-dev**: Implement UI, component tests
- **devops** (nếu cần): Chuẩn bị deployment config

database-engineer nên chạy trước hoặc đồng thời với backend-dev.

## Phase 4 — Code Review (Song song)

- **code-reviewer**: Review quality, bugs, maintainability
- **security-reviewer**: Security audit, OWASP Top 10

Fix tất cả Critical và Major issues.

## Phase 5 — QA Testing

- **qa-engineer**: Unit + integration + E2E tests, edge cases

Fix tất cả failing tests.

## Phase 6 — Browser Verification

1. Bật Browser tool
2. Navigate đến feature
3. Test golden path + edge cases
4. Check responsive mobile
5. Screenshot kết quả

## Phase 7 — Fix & Finalize

Fix issues từ review, test, browser check. Re-run tests.

## Phase 8 — Report

Báo cáo: files thay đổi, tests passing, screenshots, known limitations.
