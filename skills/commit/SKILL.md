---
name: commit
description: Write a conventional commit from the staged changes. Use when closing a task or when the user asks to commit.
---

# Conventional commit

1. Run `git diff --staged` and summarize the change. If nothing is staged, say so and stop: do not stage files on your own.
2. In TDD, the test goes first in its own `test:` commit, then the `feat:` or `fix:` (global CLAUDE.md, «Git i PR»). If the staged changes mix a new test with the code it tests, stop and propose splitting them.
3. Write the message as `type(scope): description`:
   - `type`: `feat`, `fix`, `docs`, `test`, `refactor`, `ci`, `build` or `chore`.
   - `scope`: optional, the area touched.
   - Language: the one the project's `CLAUDE.md` is written in.
   - A body only when the why is not obvious from the diff.
4. Commit with that message.
