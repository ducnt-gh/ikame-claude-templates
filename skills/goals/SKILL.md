---
name: goals
description: Automatic goal tracking for large, multi-step tasks that may span multiple sessions
autoload: true
---

# Goal Tracking

Use the right tool for the right task:

| Situation | Use |
|-----------|-----|
| Small task, ≤ 4 steps, finishes in one session | `TaskCreate` (built-in task list) |
| Large feature, ≥ 5 steps, or may span sessions | Goals (write `ikame-goal-request.json`) |

## When to create a Goal

Create a goal when the user asks you to:
- Implement, build, or create a new feature or module
- Build or scaffold an entire project
- Refactor or restructure a large codebase
- Any work with 5+ steps or that may be interrupted across sessions

Do NOT create a goal for: simple questions, explanations, single-file edits, bug fixes with ≤ 4 steps, one-line answers. Use `TaskCreate` for those instead.

## How to create a Goal

Write to `~/.claude/ikame-goal-request.json` using the Write tool **once** at the start:

```json
{
  "title": "Short title (max 60 chars)",
  "description": "What needs to be done and why",
  "steps": [
    { "description": "First concrete step" },
    { "description": "Second step" }
  ]
}
```

The extension detects this file and creates the goal automatically. Only write this file once at the start — to update progress later, write the same file with `goalId` or `goalTitle` instead of `title`.

## How to use the goal file

Write to `~/.claude/ikame-goal-request.json` for both creating and updating goals.

### Create a new goal — use `title` field (NO `goalId`):
```json
{
  "title": "Short title (max 60 chars)",
  "description": "What needs to be done and why",
  "steps": [
    { "description": "First step" },
    { "description": "Second step" }
  ]
}
```

### Update step progress — use `goalId` or `goalTitle` (⚠️ NEVER `title`):

**IMPORTANT:** When updating, use `goalId` or `goalTitle` — **NEVER the `title` field**. Including `title` signals "create new goal" and will create a duplicate.

```json
{
  "goalTitle": "Exact title of the goal you created",
  "steps": [
    { "description": "The step you completed", "status": "completed" }
  ]
}
```

Or with `goalId` (preferred when available from resume context):
```json
{
  "goalId": "goal_1234567890",
  "steps": [
    { "description": "The step you completed", "status": "completed" }
  ]
}
```

**Rules:**
- `goalTitle` must match the exact title you used when creating the goal
- `goalId` is provided in the resume context when user clicks "Continue" — always prefer it over `goalTitle`
- Only include steps that changed — other steps are untouched
- Valid statuses: `"pending"`, `"active"`, `"completed"`
- Write right after completing each step
- **Never include `title` in an update** — it creates a brand-new goal

**Detection:** `goalId` or `goalTitle` present → update existing goal. `title` present → create new goal.

## Session resume

If a goal is injected at the start of this session, a previous session was interrupted. Continue from the last incomplete step without creating a new goal.
