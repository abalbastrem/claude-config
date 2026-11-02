# claude-config

Configuració personal de Claude Code, compartida entre projectes.

- `CLAUDE.md`: preferències i flux de treball generals. El que és propi d'un projecte es queda al `CLAUDE.md` d'aquell projecte.

## Instal·lació

Claude Code llegeix `~/.claude/CLAUDE.md` a tots els projectes. Aquest fitxer només ha de contenir una línia que importi el d'aquest repo:

```
@~/projects/software/claude-config/CLAUDE.md
```

S'importa en lloc de fer un enllaç simbòlic perquè a Windows els enllaços demanen el mode de desenvolupador o permisos d'administrador.

Per comprovar que s'aplica, executa `/memory` dins de Claude Code.
