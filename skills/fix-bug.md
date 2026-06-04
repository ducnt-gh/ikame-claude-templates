---
name: fix-bug
description: Bug fix workflow — reproduce → root cause → fix → regression test → browser verify
---

# Skill: Fix Bug

## Phase 1 — Reproduce

Thu thập: steps to reproduce, expected vs actual, error messages, stack traces.
Dùng Grep để tìm error message và function names trong codebase.

## Phase 2 — Root Cause Analysis

Dùng **tech-lead** để:
- Trace execution flow
- Xác định root cause (không chỉ symptom)
- Đề xuất fix approach

**Không fix trước khi hiểu root cause.**

## Phase 3 — User Confirmation (Nếu fix phức tạp)

Trình bày root cause và approach. Hỏi user confirm.

## Phase 4 — Implement Fix

Spawn agent phù hợp (backend-dev / frontend-dev / database-engineer).
**Bắt buộc**: Viết regression test reproduce bug này.

## Phase 5 — Regression Test

Dùng **qa-engineer**:
- Test reproduce bug cũ
- Verify pass sau fix
- Chạy existing tests để ensure no regression

## Phase 6 — Security Check (Nếu liên quan đến auth/input/file)

Dùng **security-reviewer** verify fix không tạo vulnerabilities mới.

## Phase 7 — Browser Verification

Navigate → reproduce steps → confirm fixed → test adjacent functionality.

## Phase 8 — Report

Root cause, fix approach, regression test added, files changed, potential related issues.
