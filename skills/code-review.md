---
name: code-review
description: Multi-agent code review — quality + security song song, tổng hợp findings, prioritized fixes
---

# Skill: Code Review

Spawn **code-reviewer** và **security-reviewer** song song, tổng hợp kết quả.

## Bước 1 — Xác định Scope

- Files/PR cần review
- Context: feature mới, bug fix, hay refactor?
- Areas đặc biệt cần chú ý?

## Bước 2 — Spawn Song Song

**code-reviewer**: Review logic, quality, performance, test coverage, coding standards.

**security-reviewer**: OWASP Top 10, injection, auth/authz, sensitive data, dependencies CVEs.

## Bước 3 — Tổng hợp

```
## Code Review Summary
### 🔴 Must Fix (Critical + Security Critical)
### 🟡 Should Fix (Major)
### 🔵 Nice to Fix (Minor)
### ✅ Good Parts
### Recommendation: [Approve / Request Changes]
```

## Bước 4 — Fix (Nếu được yêu cầu)

Spawn agent phù hợp để fix, sau đó re-review files đã thay đổi.
