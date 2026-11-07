---
name: prompt-log
description: Turn automatic logging of the user's prompts to prompts.md on or off. Use when the user runs /prompt-log, or asks to start, stop or check recording their prompts.
argument-hint: on | off | status
---

# Prompt log

Records every prompt the user sends to `prompts.md` at the project root, from the moment it is
turned on until it is turned off.

## How it works

You do not write the prompts yourself. A `UserPromptSubmit` hook
(`hooks/prompt-log.sh` of the claude-config repo, registered in `~/.claude/settings.json`) appends each prompt to
`prompts.md` whenever the flag file `.claude/prompt-log.active` exists. This skill only toggles
that flag, so logging keeps working after context compaction, `/clear` or a new session, and
costs no tool calls per prompt.

Each entry follows the course template already in `prompts.md`:

````markdown
## Prompt N

**Modelo:** <model from the session transcript>
**Herramienta:** Claude Code

```
<the prompt, verbatim>
```
````

The hook never logs:

- prompts starting with `/prompt-log` (turning the log on or off is not part of the work);
- prompts containing the marker `#nolog` (the per-prompt skip).

## Arguments

Read `$ARGUMENTS`. If it is empty, treat it as `status`.

### `on`

1. Create `.claude/prompt-log.active` (empty file).
2. If `prompts.md` does not exist, create it with a `# Prompts` heading.
3. If `prompts.md` still contains the template's example entry (the `## Prompt 1` whose code
   block starts with `Este es el ejemplo. Bórralo.`), delete that example entry, from its
   `## Prompt 1` heading through its `**Qué salió:**` line, and the
   `Borra el ejemplo de abajo cuando escribas el primero.` line. Leave the rest of the
   template text untouched.
4. Tell the user, in one or two lines, that logging is on, that the next prompt is the first
   one recorded, and that adding `#nolog` anywhere in a prompt skips it.

### `off`

1. Delete `.claude/prompt-log.active`.
2. Tell the user logging is off and how many `## Prompt N` entries `prompts.md` now holds.

### `status`

Say whether `.claude/prompt-log.active` exists and how many entries `prompts.md` holds.

## While logging is on

- When a prompt contains `#nolog`, ignore the marker itself: it is an instruction to the hook,
  not part of the request.
- Never edit or reword the logged prompts. The point of the file is to show the prompts exactly
  as they were sent, typos included.
- The hook cannot see the effort level, only the model. If the user wants it in the entry
  (e.g. `Opus 5.5 xHigh`), they edit the `**Modelo:**` line by hand.
