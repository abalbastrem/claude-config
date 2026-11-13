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
- `hooks/prompt-log.sh`: mentre existeix `.claude/prompt-log.active` al projecte, afegeix cada prompt a `prompts.md` amb el format de la plantilla del curs. El fa servir la skill `prompt-log`. Necessita `jq`.
- `hooks/settings-hooks.json`: la definició dels hooks. Claude Code no pot importar-la, així que cal copiar-ne el bloc `hooks` a `~/.claude/settings.json`.

Els sons són a `hooks/sounds/` i vénen de Freesound. Per canviar-los, posa-hi un `.wav` (convertit amb `ffmpeg` si és un altre format) i canvia el nom de fitxer a `hooks/notify-sound.sh`. El canvi s'aplica de seguida, sense reiniciar.

### Crèdits dels sons

- Pregunta o permís: [alienbeacon1](https://freesound.org/s/455470/), de zimbot, a Freesound.
- Final del torn: [sci-fi computing tr1](https://freesound.org/s/786190/), de danymo, a Freesound. Convertit d'MP3 a WAV.

## Agents

- `agents/adversarial-reviewer.md`: revisa un PR per trencar-lo, no per aprovar-lo. A més de bugs i seguretat, comprova les regles de tests del `CLAUDE.md`: que cada test pengi d'un criteri, el nivell de cada test, l'E2E i la classificació de la cobertura. Claude Code només llegeix agents d'usuari de `~/.claude/agents/`, així que cal copiar-hi el fitxer. Si un projecte té un agent amb el mateix nom a `.claude/agents/`, mana el del projecte.

## Skills

- `skills/prompt-log/`: activa i desactiva el registre de prompts (`/prompt-log on|off|status`). Claude Code només llegeix skills de `~/.claude/skills/`, així que cal copiar-hi la carpeta. Afegeix `.claude/prompt-log.active` al `.gitignore` de cada projecte on la facis servir.
