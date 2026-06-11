---
name: goals
description: Automatic goal tracking for large, multi-step tasks that may span multiple sessions
autoload: true
---

# Goal Tracking

## MANDATORY — Create a Goal BEFORE starting any substantial task

**Before doing any work**, ask yourself: *"Will this take more than a minute, require reading multiple files, spawn agents, or involve more than 2 steps?"*

If YES → **create a goal immediately**, then start working.

| Situation | Use |
|-----------|-----|
| Quick answer, single lookup, one-liner | No tracking needed |
| 2–4 steps, finishes fast | `TaskCreate` (built-in task list) |
| **Anything else** — multi-file, agents, debugging, feature, refactor | **Goals** (write `ikame-goal-request.json`) |

## When to create a Goal

Create a goal **immediately at the start** when the task involves ANY of:
- Implementing, building, or adding any feature or functionality
- Fixing a bug that requires reading code, debugging, or testing
- Refactoring, restructuring, or migrating code
- Running agents or spawning subagents
- Reading more than 2 files to understand the codebase
- Any work that will consume significant tokens or time
- Any work that might span multiple back-and-forth turns

**Rule of thumb: if you're about to do real work — create a goal first.**

Do NOT create a goal for: simple factual questions, single-line edits already specified, pure explanations with no code changes.

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
