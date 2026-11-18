#!/usr/bin/env bash
# Links this repo's user-level config into ~/.claude, so Claude Code always runs
# what is versioned here instead of a copy that drifts. Idempotent: run it again
# after cloning, or whenever a new link is added below.
#
# Anything already at a link's place that is not the right link is moved to its
# own ~/.claude/backup-<date>-<random>/ folder, never deleted. It never writes
# through a folder that is itself a link, so it can't touch this repo.
#
# Windows: needs developer mode (Settings → System → For developers) and Git
# Bash; MSYS=winsymlinks:nativestrict makes ln -s create real links and fail
# instead of silently copying. Tested by test-install.sh.
set -euo pipefail

: "${HOME:?HOME is not set}"

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) export MSYS=winsymlinks:nativestrict ;;
esac

# Physical path of a file or folder, without readlink -f (missing on older macOS).
real() {
  if [ -d "$1" ]; then (cd -P "$1" && pwd -P); else echo "$(cd -P "$(dirname "$1")" && pwd -P)/$(basename "$1")"; fi
}

repo=$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
claude="$HOME/.claude"

# Destination in ~/.claude → source in this repo.
links=(
  "agents:agents"
  "skills/matrix:skills/matrix"
  "skills/prompt-log:skills/prompt-log"
  "statusline-command.sh:statusline/statusline-command.sh"
)

# Check everything before touching anything.
for entry in "${links[@]}"; do
  src="$repo/${entry#*:}"
  [ -e "$src" ] || { echo "ERROR: $src does not exist." >&2; exit 1; }
done
for dir in "$claude" "$claude/skills"; do
  if [ -L "$dir" ]; then
    echo "ERROR: $dir is itself a link (to $(readlink "$dir"))." >&2
    echo "  Linking through it would write somewhere else, maybe into this repo." >&2
    echo "  Turn it back into a normal folder and run this again." >&2
    exit 1
  fi
done

# A real link, file and folder, or stop: a copy is exactly what this avoids.
probe=$(mktemp -d)
trap 'rm -rf "$probe"' EXIT
touch "$probe/file" && mkdir "$probe/dir"
if ! ln -s "$probe/file" "$probe/file-link" 2>/dev/null || [ ! -L "$probe/file-link" ] \
  || ! ln -s "$probe/dir" "$probe/dir-link" 2>/dev/null || [ ! -L "$probe/dir-link" ]; then
  echo "ERROR: cannot create symbolic links here." >&2
  echo "  On Windows, turn on developer mode (Settings → System → For developers)" >&2
  echo "  and run this from Git Bash." >&2
  exit 1
fi

mkdir -p "$claude/skills"
backup=""

for entry in "${links[@]}"; do
  name=${entry%%:*}
  dest="$claude/$name"
  src="$repo/${entry#*:}"
  if [ -L "$dest" ] && [ "$(real "$(readlink "$dest")")" = "$(real "$src")" ]; then
    echo "ok       $name"
    continue
  fi
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    [ -n "$backup" ] || backup=$(mktemp -d "$claude/backup-$(date +%Y%m%d-%H%M%S)-XXXX")
    mkdir -p "$backup/$(dirname "$name")"
    was=""
    [ -L "$dest" ] && was=" (was a link to $(readlink "$dest"))"
    mv "$dest" "$backup/$name"
    echo "backup   $name → $backup/$name$was"
  fi
  ln -s "$src" "$dest"
  echo "linked   $name → $src"
done
