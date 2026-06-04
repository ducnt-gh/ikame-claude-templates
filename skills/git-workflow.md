---
name: git-workflow
description: Git workflow chuẩn — branch naming, conventional commits, PR standards
---

# Git Workflow Standards

## Branch Naming

```
{type}/{ticket-id}-{short-description}

feat/USER-123-user-authentication
fix/PROJ-456-login-redirect-loop
hotfix/payment-null-pointer
refactor/extract-auth-middleware
chore/upgrade-node-18
```

## Commit Messages (Conventional Commits)

```
{type}({scope}): {description}

Types: feat fix refactor perf test docs style chore ci revert

Ví dụ tốt:
feat(auth): add JWT refresh token rotation
fix(payment): sửa lỗi null pointer khi user chưa có địa chỉ
refactor(user): tách UserService thành UserService + ProfileService

Ví dụ xấu:
fixed stuff          ← quá chung chung
WIP                  ← không đủ thông tin
Updated file.ts      ← mô tả WHAT không WHY
```

## PR Standards

- Title: format giống commit message
- Description: mô tả tại sao, danh sách thay đổi, testing steps, screenshots nếu có UI
- Size: lý tưởng < 400 lines, tối đa 800 lines
- Cần ít nhất 1 approval trước khi merge
- Squash merge để giữ history sạch

## Branching Strategy

```
main → luôn deployable
  └── feat/... fix/... → branch từ main, merge về main
```

## Rules

- Không commit trực tiếp vào main
- Rebase thay vì merge để history linear
- Commit nhỏ, focused — mỗi commit = 1 logical change
- Không commit secrets/credentials
