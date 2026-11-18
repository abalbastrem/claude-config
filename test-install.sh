#!/usr/bin/env bash
# Runs install.sh against throwaway HOME folders and checks what it leaves
# behind. It works on a temporary copy of this repo, so a bug in install.sh can
# never move or overwrite the real one, and never touches the real ~/.claude.
# Usage: ./test-install.sh
set -uo pipefail

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) export MSYS=winsymlinks:nativestrict ;;
esac

source_repo=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
repo=$(mktemp -d)/repo
mkdir -p "$repo"
cp -R "$source_repo/install.sh" "$source_repo/agents" "$source_repo/skills" "$source_repo/statusline" "$repo/"
repo=$(cd -P "$repo" && pwd -P)

failures=0
pass() { echo "  ok    $1"; }
fail() { echo "  FAIL  $1"; failures=$((failures + 1)); }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }
fresh_home() { mktemp -d; }
# Physical path of a file or folder, without readlink -f (missing on older macOS).
real() { if [ -d "$1" ]; then (cd -P "$1" && pwd -P); else echo "$(cd -P "$(dirname "$1")" && pwd -P)/$(basename "$1")"; fi; }
links_to() { [ -L "$1" ] && [ "$(real "$(readlink "$1")")" = "$(real "$2")" ]; }

echo "Fresh install"
h=$(fresh_home)
HOME=$h "$repo/install.sh" >/dev/null 2>&1
check "agents is a link to the repo" 'links_to "$h/.claude/agents" "$repo/agents"'
check "skills/matrix is a link to the repo" 'links_to "$h/.claude/skills/matrix" "$repo/skills/matrix"'
check "skills/prompt-log is a link to the repo" 'links_to "$h/.claude/skills/prompt-log" "$repo/skills/prompt-log"'
check "statusline-command.sh is a link to the repo" 'links_to "$h/.claude/statusline-command.sh" "$repo/statusline/statusline-command.sh"'

echo "Second run changes nothing"
out=$(HOME=$h "$repo/install.sh" 2>&1)
check "every line says ok" '[ "$(echo "$out" | grep -vc "^ok ")" = 0 ]'
check "no backup folder" '! ls -d "$h"/.claude/backup-* >/dev/null 2>&1'

echo "A correct link with a relative path is left alone"
h=$(fresh_home)
mkdir -p "$h/.claude"
HOME=$h "$repo/install.sh" >/dev/null 2>&1
rm "$h/.claude/agents"
rel=$(cd "$h/.claude" && python -c "import os,sys; print(os.path.relpath(sys.argv[1]))" "$repo/agents" 2>/dev/null || echo "")
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

echo "Two backups never collide"
mkdir -p "$h/.claude/x" && rm "$h/.claude/agents" && mkdir "$h/.claude/agents" && echo second > "$h/.claude/agents/own.md"
HOME=$h "$repo/install.sh" >/dev/null 2>&1
rm "$h/.claude/agents" && mkdir "$h/.claude/agents" && echo third > "$h/.claude/agents/own.md"
HOME=$h "$repo/install.sh" >/dev/null 2>&1
check "three backups of agents, none nested" '[ "$(ls -d "$h"/.claude/backup-*/agents | wc -l)" = 3 ] && ! ls -d "$h"/.claude/backup-*/agents/agents >/dev/null 2>&1'

echo "A skills folder that is itself a link is refused, and the repo is untouched"
h=$(fresh_home)
mkdir -p "$h/.claude"
ln -s "$repo/skills" "$h/.claude/skills"
HOME=$h "$repo/install.sh" >/dev/null 2>&1
code=$?
check "install.sh fails" '[ "$code" != 0 ]'
check "the repo still has skills/matrix as a real folder" '[ -d "$repo/skills/matrix" ] && [ ! -L "$repo/skills/matrix" ] && [ -f "$repo/skills/matrix/SKILL.md" ]'

echo "An empty HOME is refused"
before=$(ls -la /.claude 2>/dev/null)
HOME="" "$repo/install.sh" >/dev/null 2>&1
code=$?
check "install.sh fails" '[ "$code" != 0 ]'
check "nothing written to /.claude" '[ "$(ls -la /.claude 2>/dev/null)" = "$before" ]'

echo
if [ "$failures" = 0 ]; then echo "All checks passed."; else echo "$failures check(s) failed."; exit 1; fi
