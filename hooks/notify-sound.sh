#!/usr/bin/env bash
# So d'avís per als hooks de Claude Code: "inici" quan arrenca, "atencio" per a preguntes i permisos, "fi" quan acaba.
cat > /dev/null
# Only on Windows (Git Bash): elsewhere there is no cygpath nor winsound, so it exits quietly.
command -v cygpath > /dev/null 2>&1 || exit 0
dir="$(cd "$(dirname "$0")" && pwd)/sounds"
case "$1" in
  inici)   so="$dir/636652__cogfirestudios__ui-app.wav" ;;
  atencio) so="$dir/455470__zimbot__alienbeacon1.wav" ;;
  *)       so="$dir/786190__danymo__sci-fi_computing_tr1.wav" ;;
esac
python -c "import sys, winsound; winsound.PlaySound(sys.argv[1], winsound.SND_FILENAME)" "$(cygpath -w "$so")" > /dev/null 2>&1
