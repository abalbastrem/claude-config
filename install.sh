#!/usr/bin/env bash
# Links this repo's user-level config into ~/.claude, so Claude Code always runs
# what is versioned here instead of a copy that drifts. Idempotent: run it again
# after cloning, or whenever a new link is added below.
#
# Anything already at a link's place that is not the right link is moved to
# ~/.claude/backup-<date>/, never deleted.
#
# Windows: needs developer mode (Settings → System → For developers) and
# MSYS=winsymlinks:nativestrict, so that ln -s makes real links and fails
# instead of silently copying. The README explains both.
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
claude="$HOME/.claude"

# Destination in ~/.claude → source in this repo.
links=(
  "agents:agents"
  "skills/matrix:skills/matrix"
  "skills/prompt-log:skills/prompt-log"
  "statusline-command.sh:statusline/statusline-command.sh"
)

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) export MSYS=winsymlinks:nativestrict ;;
esac

# A real link, or stop: a copy is exactly what this script exists to avoid.
probe=$(mktemp -d)
trap 'rm -rf "$probe"' EXIT
touch "$probe/target"
if ! ln -s "$probe/target" "$probe/link" 2>/dev/null || [ ! -L "$probe/link" ]; then
  echo "ERROR: cannot create symbolic links here." >&2
  echo "  On Windows, turn on developer mode (Settings → System → For developers)" >&2
  echo "  and run this from Git Bash." >&2
  exit 1
fi

backup="$claude/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$claude/skills"

for entry in "${links[@]}"; do
  dest="$claude/${entry%%:*}"
  src="$repo/${entry#*:}"
  if [ ! -e "$src" ]; then
    echo "ERROR: $src does not exist." >&2
    exit 1
  fi
  if [ -L "$dest" ] && [ "$(readlink -f "$dest")" = "$(readlink -f "$src")" ]; then
    echo "ok       ${entry%%:*}"
    continue
  fi
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    mkdir -p "$backup/$(dirname "${entry%%:*}")"
    mv "$dest" "$backup/${entry%%:*}"
    echo "backup   ${entry%%:*} → $backup/${entry%%:*}"
  fi
  ln -s "$src" "$dest"
  echo "linked   ${entry%%:*} → $src"
done
