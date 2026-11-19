#!/usr/bin/env bash
# Runs install.sh against throwaway HOME folders and checks what it leaves
# behind. It works on a temporary copy of this repo, so a bug in install.sh can
# never move or overwrite the real one, and never touches the real ~/.claude.
# Everything it creates lives under one temporary folder, removed at the end.
# Usage: ./test-install.sh
set -uo pipefail

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) export MSYS=winsymlinks:nativestrict ;;
esac

source_repo=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# A copy of the files install.sh needs, under the temporary folder.
copy_repo() {
  mkdir -p "$1"
  cp -R "$source_repo/install.sh" "$source_repo/settings.shared.json" "$source_repo/agents" "$source_repo/skills" "$source_repo/statusline" "$1/"
  (cd -P "$1" && pwd -P)
}
repo=$(copy_repo "$work/repo")

failures=0
pass() { echo "  ok    $1"; }
fail() { echo "  FAIL  $1"; failures=$((failures + 1)); }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }
fresh_home() { mktemp -d "$work/home.XXXX"; }
# Physical path of a file or folder, without readlink -f (missing on older macOS).
real() { if [ -d "$1" ]; then (cd -P "$1" && pwd -P); else echo "$(cd -P "$(dirname "$1")" && pwd -P)/$(basename "$1")"; fi; }
target() { local t; t=$(readlink "$1"); case "$t" in /* | [A-Za-z]:*) echo "$t" ;; *) echo "$(dirname "$1")/$t" ;; esac; }
links_to() { [ -L "$1" ] && [ "$(real "$(target "$1")")" = "$(real "$2")" ]; }
# Relative path from folder $1 to $2, with whichever tool the machine has.
# GNU realpath first (Linux, Git Bash); python as a fallback (macOS). A tool
# that exists but fails, like Windows' python3 store alias, is skipped.
relpath() {
  local out py
  out=$(realpath --relative-to="$1" "$2" 2>/dev/null) && [ -n "$out" ] && { echo "$out"; return; }
  for py in python3 python; do
    out=$("$py" -c 'import os,sys; print(os.path.relpath(sys.argv[2], sys.argv[1]))' "$1" "$2" 2>/dev/null) && [ -n "$out" ] && { echo "$out"; return; }
  done
}

echo "Fresh install"
h=$(fresh_home)
HOME=$h "$repo/install.sh" >/dev/null 2>&1
check "agents is a link to the repo" 'links_to "$h/.claude/agents" "$repo/agents"'
check "skills/matrix is a link to the repo" 'links_to "$h/.claude/skills/matrix" "$repo/skills/matrix"'
check "skills/prompt-log is a link to the repo" 'links_to "$h/.claude/skills/prompt-log" "$repo/skills/prompt-log"'
check "skills/commit is a link to the repo" 'links_to "$h/.claude/skills/commit" "$repo/skills/commit"'
check "skills/priority-ticket is a link to the repo" 'links_to "$h/.claude/skills/priority-ticket" "$repo/skills/priority-ticket"'
check "statusline-command.sh is a link to the repo" 'links_to "$h/.claude/statusline-command.sh" "$repo/statusline/statusline-command.sh"'

echo "Second run changes nothing"
out=$(HOME=$h "$repo/install.sh" 2>&1)
check "every line says ok" '[ "$(echo "$out" | grep -vc "^ok ")" = 0 ]'
check "no backup folder" '! ls -d "$h"/.claude/backup-* >/dev/null 2>&1'

echo "Shared settings: created when there are none"
h=$(fresh_home)
HOME=$h "$repo/install.sh" >/dev/null 2>&1
s="$h/.claude/settings.json"
check "settings.json exists and is JSON" 'jq -e . "$s" >/dev/null 2>&1'
check "it has the shared deny rules" 'jq -e ".permissions.deny | index(\"Bash(gh pr merge *)\")" "$s" >/dev/null'
check "hook paths point to the repo" 'jq -r ".hooks.Stop[0].hooks[0].command" "$s" | grep -q "notify-sound.sh fi" && ! grep -q "{{CLAUDE_CONFIG}}" "$s"'

echo "Shared settings: merged into existing ones, keeping everything else"
h=$(fresh_home)
mkdir -p "$h/.claude"
cat > "$h/.claude/settings.json" <<'JSON'
{ "env": { "MINE": "1" }, "theme": "dark",
  "permissions": { "deny": ["PowerShell", "Bash(rm -rf *)"], "additionalDirectories": ["/somewhere"] },
  "autoMode": { "allow": ["my own rule"] } }
JSON
HOME=$h "$repo/install.sh" >/dev/null 2>&1
s="$h/.claude/settings.json"
check "own keys are kept" '[ "$(jq -r ".env.MINE, .theme, .permissions.additionalDirectories[0], .autoMode.allow[0]" "$s" | tr "\n" " ")" = "1 dark /somewhere my own rule " ]'
check "own deny rules are kept" 'jq -e ".permissions.deny | index(\"Bash(rm -rf *)\")" "$s" >/dev/null'
check "shared deny rules are added, none twice" '[ "$(jq "[.permissions.deny[] | select(. == \"PowerShell\")] | length" "$s")" = 1 ] && jq -e ".permissions.deny | index(\"Bash(gh pr merge *)\")" "$s" >/dev/null'
check "the old settings.json is in the backup" '[ "$(jq -r .env.MINE "$h"/.claude/backup-*/settings.json 2>/dev/null)" = 1 ]'
before=$(cat "$s")
out=$(HOME=$h "$repo/install.sh" 2>&1)
check "a second run leaves it byte for byte" '[ "$(cat "$s")" = "$before" ]'
check "and says so" 'echo "$out" | grep -q "^ok  *settings.json$"'

echo "A correct link with a relative path is left alone"
h=$(fresh_home)
HOME=$h "$repo/install.sh" >/dev/null 2>&1
rm "$h/.claude/agents"
rel=$(relpath "$(real "$h/.claude")" "$(real "$repo/agents")")
if [ -n "$rel" ] && (cd "$h/.claude" && ln -s "$rel" agents); then
  out=$(HOME=$h "$repo/install.sh" 2>&1)
  check "agents says ok" 'echo "$out" | grep -q "^ok  *agents$"'
  check "no backup folder" '! ls -d "$h"/.claude/backup-* >/dev/null 2>&1'
  check "no error output" '! echo "$out" | grep -qi "no such file"'
else
  fail "could not build a relative link for the test"
fi

echo "An existing folder is moved to a backup, not deleted"
h=$(fresh_home)
mkdir -p "$h/.claude/agents" && echo mine > "$h/.claude/agents/own.md"
HOME=$h "$repo/install.sh" >/dev/null 2>&1
check "agents is now a link" 'links_to "$h/.claude/agents" "$repo/agents"'
check "the old file is in the backup" '[ "$(cat "$h"/.claude/backup-*/agents/own.md 2>/dev/null)" = mine ]'

echo "Three runs in a row make three separate backups"
for n in second third; do
  rm "$h/.claude/agents" && mkdir "$h/.claude/agents" && echo "$n" > "$h/.claude/agents/own.md"
  HOME=$h "$repo/install.sh" >/dev/null 2>&1
done
check "three backups of agents" '[ "$(ls -d "$h"/.claude/backup-*/agents | wc -l | tr -d " ")" = 3 ]'
check "none nested inside another" '! ls -d "$h"/.claude/backup-*/agents/agents >/dev/null 2>&1'
check "each kept its own file" '[ "$(cat "$h"/.claude/backup-*/agents/own.md | sort | tr "\n" " ")" = "mine second third " ]'

echo "An old link elsewhere is backed up, and the log says where it pointed"
h=$(fresh_home)
mkdir -p "$h/.claude" "$h/elsewhere"
ln -s "$h/elsewhere" "$h/.claude/agents"
out=$(HOME=$h "$repo/install.sh" 2>&1)
check "agents now links to the repo" 'links_to "$h/.claude/agents" "$repo/agents"'
check "the log names the old target" 'echo "$out" | grep -q "was a link to .*elsewhere"'
check "the old target is untouched" '[ -d "$h/elsewhere" ]'

echo "A missing file in the repo stops it before anything changes"
broken=$(copy_repo "$work/broken")
rm -r "$broken/statusline"
h=$(fresh_home)
mkdir -p "$h/.claude/agents" && echo mine > "$h/.claude/agents/own.md"
HOME=$h "$broken/install.sh" >/dev/null 2>&1
code=$?
check "install.sh fails" '[ "$code" != 0 ]'
check "agents is still the old folder" '[ ! -L "$h/.claude/agents" ] && [ "$(cat "$h/.claude/agents/own.md")" = mine ]'
check "no link was created" '[ -z "$(find "$h/.claude" -type l)" ]'

echo "A skills folder that is itself a link is refused, and the repo is untouched"
h=$(fresh_home)
mkdir -p "$h/.claude"
ln -s "$repo/skills" "$h/.claude/skills"
HOME=$h "$repo/install.sh" >/dev/null 2>&1
code=$?
check "install.sh fails" '[ "$code" != 0 ]'
check "the repo still has skills/matrix as a real folder" '[ -d "$repo/skills/matrix" ] && [ ! -L "$repo/skills/matrix" ] && [ -f "$repo/skills/matrix/SKILL.md" ]'

echo "A ~/.claude that is itself a link is refused"
h=$(fresh_home)
mkdir -p "$h/real-claude"
ln -s "$h/real-claude" "$h/.claude"
HOME=$h "$repo/install.sh" >/dev/null 2>&1
code=$?
check "install.sh fails" '[ "$code" != 0 ]'
check "nothing written through it" '[ -z "$(ls -A "$h/real-claude")" ]'

echo "An empty or unset HOME is refused"
before=$(ls -la /.claude 2>/dev/null)
HOME="" "$repo/install.sh" >/dev/null 2>&1
code=$?
check "empty HOME: install.sh fails" '[ "$code" != 0 ]'
env -u HOME "$repo/install.sh" >/dev/null 2>&1
code=$?
check "unset HOME: install.sh fails" '[ "$code" != 0 ]'
check "nothing written to /.claude" '[ "$(ls -la /.claude 2>/dev/null)" = "$before" ]'

echo
if [ "$failures" = 0 ]; then echo "All checks passed."; else echo "$failures check(s) failed."; exit 1; fi
