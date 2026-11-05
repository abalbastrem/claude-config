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

## Hooks

- `hooks/notify-sound.sh`: fa sonar un avís de Windows quan Claude Code fa una pregunta, demana un permís o acaba. Necessita Windows i `python` al `PATH`.
- `hooks/settings-hooks.json`: la definició dels hooks. Claude Code no pot importar-la, així que cal copiar-ne el bloc `hooks` a `~/.claude/settings.json`.

Els sons són a `hooks/sounds/` i vénen de Freesound. Per canviar-los, posa-hi un `.wav` (convertit amb `ffmpeg` si és un altre format) i canvia el nom de fitxer a `hooks/notify-sound.sh`. El canvi s'aplica de seguida, sense reiniciar.

### Crèdits dels sons

- Pregunta o permís: [alienbeacon1](https://freesound.org/s/455470/), de zimbot, a Freesound.
- Final del torn: [sci-fi computing tr1](https://freesound.org/s/786190/), de danymo, a Freesound. Convertit d'MP3 a WAV.
