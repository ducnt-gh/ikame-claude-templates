---
name: goals
description: Automatic goal tracking for multi-step tasks across sessions
autoload: true
---

# Goal Tracking

When starting a task that involves multiple steps, file changes, or may span multiple sessions, create a goal BEFORE beginning work.

## When to create a goal

Create a goal when the user asks you to:
- Implement, build, or create a feature
- Fix a bug or debug an issue
- Refactor or restructure code
- Write tests or documentation for a non-trivial codebase
- Research and summarize a complex topic

Do NOT create a goal for: simple questions, explanations, single-file edits, or one-line answers.

## How to create a goal

Write to `~/.claude/ikame-goal-request.json` using the Write tool:

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

The extension detects this file automatically and creates the goal. Write this file ONCE at the start, before doing any other work.

## How to update goal progress

When a step is completed, rewrite the file with updated steps:
- Add `"status": "completed"` to finished steps
- The extension updates the goal panel automatically

## Session resume

If you see a goal injected at the start of this session, it means a previous session was interrupted. Continue from the last incomplete step.
