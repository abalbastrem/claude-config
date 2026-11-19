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
# An empty settings.json (say, truncated by a crash) counts as {}; anything else
# must be a JSON object, or nothing is touched.
current='{}'
if [ -e "$settings" ] && [ -n "$(tr -d ' \t\r\n' < "$settings")" ]; then
  current=$(cat "$settings")
fi
if [ "$(jq -r 'type' <<<"$current" 2>/dev/null | tr -d '\r')" != object ]; then
  echo "ERROR: $settings is not a JSON object; fix it before running this again." >&2
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
# user already has always wins (a value of another type is reported). A shared
# hook group counts as present when a group with the same matcher already holds
# all its hooks, with this repo's path written any way (~/…, $HOME/…, /c/…,
# C:/…, C:\…, quoted or not). {{CLAUDE_CONFIG}} becomes this repo's path, as
# $HOME/… when it lives under HOME. Not atomic against Claude Code writing the
# file at the same moment; the backup covers that.
repo_path=$repo
reprs=("$repo")
command -v cygpath >/dev/null 2>&1 && reprs+=("$(cygpath -m "$repo")")
case "$repo" in "$(real "$HOME")"/*)
  rel=${repo#"$(real "$HOME")"}
  repo_path="\$HOME$rel"
  reprs+=("\$HOME$rel" "~$rel")
  ;;
esac
reprs_json=$(MSYS2_ARG_CONV_EXCL="*" jq -cn '$ARGS.positional | sort_by(-length)' --args "${reprs[@]}")
export CLAUDE_CONFIG_REPRS=$reprs_json
jq_merge='
  ($ENV.CLAUDE_CONFIG_REPRS | fromjson) as $reprs |
  def norm: gsub("\""; "") | gsub("\\\\"; "/") | reduce $reprs[] as $r (.; split($r) | join("{{CLAUDE_CONFIG}}"));
  def nh: if type == "object" and has("command") then .command |= norm else . end;
  def covers($g; $x):
    ($g|type) == "object" and (($g.matcher // null) == ($x.matcher // null))
    and ([$x.hooks[]? | nh] - [$g.hooks[]? | nh] | length == 0);
  def present($a; $x):
    if ($x|type) == "object" and ($x|has("hooks")) then $a | any(covers(.; $x)) else $a | any(. == $x) end;
  def merge($a; $b):
    if $a == null then $b
    elif ($a|type) == "object" and ($b|type) == "object" then reduce ($b|keys_unsorted[]) as $k ($a; .[$k] = merge($a[$k]; $b[$k]))
    elif ($a|type) == "array" and ($b|type) == "array" then $a + [$b[] | . as $x | select(present($a; $x) | not)]
    else $a end;
  def clashes($a; $b; $p):
    if ($a|type) == "object" and ($b|type) == "object" then ($b|keys_unsorted[]) as $k | clashes($a[$k]; $b[$k]; $p + [$k])
    elif $a == null or $b == null then empty
    elif ($a|type) != ($b|type) then $p | join(".")
    else empty end;
  ($s[0] | walk(if type == "string" then split("{{CLAUDE_CONFIG}}") | join($p) else . end)) as $shared'
merged=$(jq --arg p "$repo_path" --slurpfile s "$shared" "$jq_merge | merge(.; \$shared)" <<<"$current") \
  || { echo "ERROR: could not merge $shared into $settings." >&2; exit 1; }
jq -r --arg p "$repo_path" --slurpfile s "$shared" "$jq_merge | clashes(.; \$shared; [])" <<<"$current" | tr -d '\r' \
  | while read -r path; do echo "WARNING  settings.json: $path has another type than in settings.shared.json; the shared value is not applied." >&2; done
if [ -e "$settings" ] && [ "$(jq -S . <<<"$merged" | tr -d '\r')" = "$(jq -S . <<<"$current" | tr -d '\r')" ]; then
  echo "ok       settings.json"
else
  if [ -e "$settings" ]; then
    [ -n "$backup" ] || backup=$(mktemp -d "$claude/backup-$(date +%Y%m%d-%H%M%S)-XXXX")
    cp "$settings" "$backup/settings.json"
    echo "backup   settings.json → $backup/settings.json"
  fi
  tmp=$(mktemp "$claude/settings.json.XXXX")
  if ! { jq . <<<"$merged" | tr -d '\r' > "$tmp"; } || ! mv "$tmp" "$settings"; then
    rm -f "$tmp"
    echo "ERROR: could not write $settings; it is as it was." >&2
    exit 1
  fi
  echo "merged   settings.json ← $shared"
fi
