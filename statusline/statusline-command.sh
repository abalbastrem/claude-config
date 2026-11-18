#!/bin/bash
# Status line derived from Git for Windows' default PS1:
# green user@host, purple MSYSTEM, yellow folder, cyan git branch,
# then model/effort, context %, session tokens and cost.
input=$(cat)

# "|" rather than tabs: read merges adjacent tabs, shifting fields after an
# empty one; "|" can't appear in Windows paths.
IFS='|' read -r cwd model effort ctx cost transcript limits < <(
  echo "$input" | jq -r '[
    (.workspace.current_dir // .cwd // ""),
    (.model.display_name // .model.id // "?"),
    (.effort.level // ""),
    (.context_window.used_percentage // 0),
    (.cost.total_cost_usd // 0),
    (.transcript_path // ""),
    ([(.rate_limits.five_hour.used_percentage | select(.) | "5h \(.)%"),
      (.rate_limits.seven_day.used_percentage | select(.) | "7d \(.)%")] | join(" "))
  ] | map(tostring) | join("|")' | tr -d '\r'
)
[ -z "$cwd" ] && cwd=$(pwd)
dir=$(basename "$(cd "$cwd" 2>/dev/null && pwd || echo "$cwd")")

branch=""
if b=$(git --no-optional-locks -C "$cwd" symbolic-ref --short HEAD 2>/dev/null); then
  # Where `git push` would send this branch (remote/branch); omitted when
  # nothing is configured, e.g. a branch that was never pushed.
  if p=$(git --no-optional-locks -C "$cwd" rev-parse --abbrev-ref '@{push}' 2>/dev/null); then
    branch=" ($b -> $p)"
  else
    branch=" ($b)"
  fi
elif b=$(git --no-optional-locks -C "$cwd" rev-parse --short HEAD 2>/dev/null); then
  branch=" ($b)"
fi

# Session totals summed from the transcript; the input's context_window
# token fields only cover the latest request. Messages are split across
# several lines sharing one id, hence unique_by. Fresh input only: cache
# reads are left out, cache writes (first time seen) are counted.
tokens=""
if [ -f "$transcript" ]; then
  tokens=$(jq -rs '
    def h: if . >= 1000000 then "\(. / 100000 | floor / 10)M"
           elif . >= 1000 then "\(. / 1000 | floor)k"
           else tostring end;
    [.[] | select(.type == "assistant" and .message.usage) | {id: .message.id, u: .message.usage}]
    | unique_by(.id) | map(.u)
    | "\(map(.input_tokens + (.cache_creation_input_tokens // 0)) | add // 0 | h) in / \(map(.output_tokens) | add // 0 | h) out"
  ' "$transcript" 2>/dev/null | tr -d '\r')
fi

# Shell Claude itself last ran a command in (Bash or PowerShell tool), not
# the shell this script runs in. Falls back to "-" before the first command.
shell="-"
if [ -f "$transcript" ]; then
  last=$(jq -r 'select(.type == "assistant") | .message.content[]? | select(.type == "tool_use" and (.name == "Bash" or .name == "PowerShell")) | .name' "$transcript" 2>/dev/null | tail -n 1 | tr -d '\r')
  case "$last" in
    Bash) shell="bash" ;;
    PowerShell) shell="pwsh" ;;
  esac
fi

# Name of the GitHub repo this branch pushes to (where a PR from here goes), read
# from local git config on every render (no network). The folder is shown only
# when its name differs from the repo's, so the line never repeats it. Falls
# back to origin on a detached HEAD or a branch with no remote; omitted outside
# a repo or if there's no such remote.
repo=""
slug=""
remote=$(git --no-optional-locks -C "$cwd" for-each-ref --format='%(push:remotename)' "refs/heads/$b" 2>/dev/null)
url=$(git --no-optional-locks -C "$cwd" remote get-url --push "${remote:-origin}" 2>/dev/null)
if [ -n "$url" ]; then
  slug=$(printf '%s' "$url" | sed -E 's#/+$##; s#\.git$##; s#^.*[:/]([^/:]+/[^/:]+)$#\1#')
  repo=${slug##*/}
  [ "$repo" = "$dir" ] && dir=""
fi

# Each repo gets its own background colour, derived from its owner/name, so a
# change of repo shows at a glance. Always the same colour for the same repo.
repo_bg=(28 166 25 90 30 124 94 61)
repo_style=""
if [ -n "$slug" ]; then
  h=$(printf '%s' "$slug" | cksum | cut -d' ' -f1)
  repo_style="\033[1;97;48;5;${repo_bg[h % ${#repo_bg[@]}]}m"
fi

printf '\033[32m%s@%s \033[35m%s \033[33m%s\033[36m%s\033[0m%s\n🤖 \033[1m%s\033[0m%s | 🧠 %s%% | %s | $%.2f%s' \
  "$(whoami)" "$(hostname -s 2>/dev/null || hostname)" "$shell" "$dir" "$branch" \
  "${repo:+ | 📦 $(printf "${repo_style} %s \033[0m" "$repo")}" \
  "$model" "${effort:+ 💪 $effort}" "$ctx" "${tokens:-? tok}" "$cost" "${limits:+ | $limits}"
