#!/usr/bin/env bash
# UserPromptSubmit hook for the `prompt-log` skill.
# While .claude/prompt-log.active exists, appends every prompt to prompts.md
# using the course template format (## Prompt N / Modelo / Herramienta / code block).
# Never blocks a prompt: every path ends in exit 0.

dir="${CLAUDE_PROJECT_DIR:-.}"
flag="$dir/.claude/prompt-log.active"
log="$dir/prompts.md"

[ -f "$flag" ] || exit 0

input=$(cat)
# -b: native jq.exe on Windows would otherwise turn LF into CRLF
prompt=$(printf '%s' "$input" | jq -rb '.prompt // empty' 2>/dev/null)
[ -n "$prompt" ] || exit 0

# Don't log the skill's own toggles, nor prompts the user marked as skipped
case "$prompt" in /prompt-log*) exit 0 ;; esac
case "$prompt" in *'#nolog'*) exit 0 ;; esac

# Model: last one seen in this session's transcript, else the previous entry's, else unknown
transcript=$(printf '%s' "$input" | jq -rb '.transcript_path // empty' 2>/dev/null)
model=""
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  model=$(grep -o '"model":"[^"]*"' "$transcript" | grep -v '<synthetic>' | tail -1 | cut -d'"' -f4)
fi
if [ -z "$model" ] && [ -f "$log" ]; then
  model=$(grep '^\*\*Modelo:\*\* ' "$log" | tail -1 | sed 's/^\*\*Modelo:\*\* //')
fi
[ -n "$model" ] || model="unknown"

[ -f "$log" ] || printf '# Prompts\n' > "$log"

last=$(grep -o '^## Prompt [0-9]\+' "$log" | awk '{print $3}' | sort -n | tail -1)
n=$(( ${last:-0} + 1 ))

# Fence longer than any backtick run inside the prompt, so it can't break the block
longest=$(printf '%s' "$prompt" | grep -o '`\+' | awk '{ if (length($0) > m) m = length($0) } END { print m + 0 }')
fence_len=$(( longest >= 3 ? longest + 1 : 3 ))
fence=$(printf '%*s' "$fence_len" '' | tr ' ' '`')

{
  printf '\n## Prompt %d\n\n' "$n"
  printf '**Modelo:** %s\n' "$model"
  printf '**Herramienta:** Claude Code\n\n'
  printf '%s\n%s\n%s\n' "$fence" "$prompt" "$fence"
} >> "$log"

exit 0
