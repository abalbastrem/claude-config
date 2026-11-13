#!/usr/bin/env bash
# UserPromptSubmit hook for the `prompt-log` skill.
# While .claude/prompt-log.active exists, appends every prompt to prompts.md
# as ## Prompt N / model / tool / code block.
# Labels: the first label line already in prompts.md decides. If it is a Spanish
# template label (**Modelo:** / **Herramienta:**, e.g. a course template), it keeps
# those; otherwise **Model:** / **Tool:**.
# Only lines outside code blocks count, so a logged prompt can never change the
# labels, the inherited model or the numbering.
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

# Lines of prompts.md outside code blocks (a block closes with a fence of the same length)
outside_code() {
  [ -f "$log" ] || return 0
  awk '{
    sub(/\r$/, "")
    if (fence == "" && $0 ~ /^```+$/) { fence = $0; next }
    if (fence != "" && $0 == fence)   { fence = ""; next }
    if (fence == "") print
  }' "$log"
}

model_label="Model"
tool_label="Tool"
first_label=$(outside_code | grep -o '^\*\*\(Modelo\|Herramienta\|Model\|Tool\):\*\*' | head -1)
case "$first_label" in
  '**Modelo:**' | '**Herramienta:**') model_label="Modelo"; tool_label="Herramienta" ;;
esac

# Model: last one seen in this session's transcript, else the previous entry's, else unknown
transcript=$(printf '%s' "$input" | jq -rb '.transcript_path // empty' 2>/dev/null)
model=""
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  model=$(grep -o '"model":"[^"]*"' "$transcript" | grep -v '<synthetic>' | tail -1 | cut -d'"' -f4)
fi
if [ -z "$model" ]; then
  model=$(outside_code | grep '^\*\*\(Modelo\|Model\):\*\* ' | tail -1 | sed 's/^\*\*[A-Za-z]*:\*\* //')
fi
[ -n "$model" ] || model="unknown"

last=$(outside_code | grep -o '^## Prompt [0-9]\+' | awk '{print $3}' | sort -n | tail -1)
n=$(( ${last:-0} + 1 ))

[ -f "$log" ] || printf '# Prompts\n' > "$log"

# Fence longer than any backtick run inside the prompt, so it can't break the block
longest=$(printf '%s' "$prompt" | grep -o '`\+' | awk '{ if (length($0) > m) m = length($0) } END { print m + 0 }')
fence_len=$(( longest >= 3 ? longest + 1 : 3 ))
fence=$(printf '%*s' "$fence_len" '' | tr ' ' '`')

{
  printf '\n## Prompt %d\n\n' "$n"
  printf '**%s:** %s\n' "$model_label" "$model"
  printf '**%s:** Claude Code\n\n' "$tool_label"
  printf '%s\n%s\n%s\n' "$fence" "$prompt" "$fence"
} >> "$log"

exit 0
