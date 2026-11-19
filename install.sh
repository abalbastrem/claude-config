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
# Prints nothing if the path doesn't exist, so a broken link never matches.
real() {
  if [ -d "$1" ]; then
    (cd -P "$1" 2>/dev/null && pwd -P)
  elif [ -e "$1" ]; then
    echo "$(cd -P "$(dirname "$1")" 2>/dev/null && pwd -P)/$(basename "$1")"
  fi
}

# Where a link points, with a relative target taken from the link's own folder.
target() {
  local t
  t=$(readlink "$1")
  case "$t" in
    /* | [A-Za-z]:*) echo "$t" ;;
    *) echo "$(dirname "$1")/$t" ;;
  esac
}

repo=$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
claude="$HOME/.claude"

# Destination in ~/.claude → source in this repo.
links=(
  "agents:agents"
  "skills/matrix:skills/matrix"
  "skills/prompt-log:skills/prompt-log"
  "skills/commit:skills/commit"
  "skills/priority-ticket:skills/priority-ticket"
  "statusline-command.sh:statusline/statusline-command.sh"
)

# Check everything before touching anything.
for entry in "${links[@]}"; do
  src="$repo/${entry#*:}"
  [ -e "$src" ] || { echo "ERROR: $src does not exist." >&2; exit 1; }
done
shared="$repo/settings.shared.json"
settings="$claude/settings.json"
command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is needed to merge settings.shared.json." >&2; exit 1; }
jq -e . "$shared" >/dev/null 2>&1 || { echo "ERROR: $shared is not valid JSON." >&2; exit 1; }
if [ -L "$settings" ]; then
  echo "ERROR: $settings is a link; merging would replace it. Turn it back into a normal file." >&2
  exit 1
fi
if [ -e "$settings" ] && ! jq -e . "$settings" >/dev/null 2>&1; then
  echo "ERROR: $settings is not valid JSON; fix it before merging." >&2
  exit 1
fi
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
  if [ -L "$dest" ] && [ -n "$(real "$(target "$dest")")" ] && [ "$(real "$(target "$dest")")" = "$(real "$src")" ]; then
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

# settings.json can't be a link: Claude Code rewrites it, and it holds things of
# this machine only. So the shareable part, settings.shared.json, is merged into
# it: objects key by key, arrays adding only what is missing, and a value the
# user already has always wins. {{CLAUDE_CONFIG}} becomes this repo's path.
repo_path=$repo
case "$repo" in "$(real "$HOME")"/*) repo_path="~${repo#"$(real "$HOME")"}" ;; esac
current='{}'
[ -e "$settings" ] && current=$(cat "$settings")
merged=$(jq --arg p "$repo_path" --slurpfile s "$shared" '
  def merge($a; $b):
    if $a == null then $b
    elif ($a|type) == "object" and ($b|type) == "object" then reduce ($b|keys_unsorted[]) as $k ($a; .[$k] = merge($a[$k]; $b[$k]))
    elif ($a|type) == "array" and ($b|type) == "array" then $a + [$b[] | . as $x | select(($a | any(. == $x)) | not)]
    else $a end;
  merge(.; $s[0] | walk(if type == "string" then split("{{CLAUDE_CONFIG}}") | join($p) else . end))' <<<"$current")
if [ -e "$settings" ] && [ "$(jq -S . <<<"$merged")" = "$(jq -S . "$settings")" ]; then
  echo "ok       settings.json"
else
  if [ -e "$settings" ]; then
    [ -n "$backup" ] || backup=$(mktemp -d "$claude/backup-$(date +%Y%m%d-%H%M%S)-XXXX")
    cp "$settings" "$backup/settings.json"
    echo "backup   settings.json → $backup/settings.json"
  fi
  tmp=$(mktemp "$claude/settings.json.XXXX")
  jq . <<<"$merged" > "$tmp" && mv "$tmp" "$settings"
  echo "merged   settings.json ← $shared"
fi
