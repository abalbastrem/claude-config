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
- `hooks/prompt-log.sh`: mentre existeix `.claude/prompt-log.active` al projecte, afegeix cada prompt a `prompts.md` (número, model, eina i el prompt literal). Si el fitxer ja fa servir les etiquetes `**Modelo:**` / `**Herramienta:**` d'una plantilla en castellà, com la del curs AI4Devs, les manté; si no, escriu `**Model:**` / `**Tool:**`. El fa servir la skill `prompt-log`. Necessita `jq`.
- `hooks/settings-hooks.json`: la definició dels hooks. Claude Code no pot importar-la, així que cal copiar-ne el bloc `hooks` a `~/.claude/settings.json`.

Els hooks i el `CLAUDE.md` s'executen des d'aquesta carpeta tal com està, no des d'una còpia: si canvies de branca, canvia el que fa Claude a tots els projectes. Deixa la carpeta a `main` quan no hi estiguis treballant.

Els sons són a `hooks/sounds/` i vénen de Freesound. Per canviar-los, posa-hi un `.wav` (convertit amb `ffmpeg` si és un altre format) i canvia el nom de fitxer a `hooks/notify-sound.sh`. El canvi s'aplica de seguida, sense reiniciar.

### Crèdits dels sons

- Pregunta o permís: [alienbeacon1](https://freesound.org/s/455470/), de zimbot, a Freesound.
- Final del torn: [sci-fi computing tr1](https://freesound.org/s/786190/), de danymo, a Freesound. Convertit d'MP3 a WAV.

## Matriu de traçabilitat

`tools/matrix/` és una eina general que creua, per a qualsevol projecte amb OpenSpec:

- **els escenaris:** la spec viva i els changes en curs, cadascun amb un ID `[SC-n]` únic a tot el repo;
- **els resultats dels tests:** Japa i Vitest. El títol de cada test comença per l'ID del seu escenari;
- **la cobertura de branques:** global i del codi nou respecte d'una branca base.

Ho fa amb tres fitxers:

- `matrix.ts` genera `matrix.md`, que es versiona i no porta l'estat dels tests, i `state.json`, que no es versiona. Amb `--check` falla si hi ha tests sense escenari, escenaris sense test, en vermell o només omesos, o si `matrix.md` està desfasat. La cobertura és informativa i no bloqueja mai.
- `server.ts` serveix `view.html` (per defecte a `http://localhost:5180`) i la repinta per SSE cada vegada que canvien les specs, els resultats o la cobertura, sense recarregar.
- La configuració de cada projecte viu al mateix projecte, a `<dir>/config.json`: els runners, on deixen els resultats, la branca base i els informes de cobertura.

Els projectes criden l'eina des d'aquesta carpeta, no en tenen una còpia:

```
node $CLAUDE_CONFIG/tools/matrix/matrix.ts --dir docs/traceability [--check] [--base <ref>]
node $CLAUDE_CONFIG/tools/matrix/server.ts --dir docs/traceability [--port 5180]
```

Per preparar-hi un projecte, la skill `skills/matrix/` (`/matrix setup`) crea la configuració, els targets de `make`, el hook pre-push i la cobertura, i numera els escenaris. L'assignació de tests a escenaris te la proposa, però la decideixes tu. Com les altres skills, cal copiar-la a `~/.claude/skills/matrix/`.

L'eina no té tests propis expressament: només mostra els del projecte. Necessita Node 24 o posterior, que executa el TypeScript directament.

## Agents

- `agents/adversarial-reviewer.md`: revisa un PR per trencar-lo, no per aprovar-lo. A més de bugs i seguretat, comprova les regles de tests del `CLAUDE.md`: que cada test pengi d'un criteri, el nivell de cada test, l'E2E i la classificació de la cobertura. Claude Code només llegeix agents d'usuari de `~/.claude/agents/`, així que cal copiar-hi el fitxer. Si un projecte té un agent amb el mateix nom a `.claude/agents/`, mana el del projecte.

## Skills

- `skills/prompt-log/`: activa i desactiva el registre de prompts (`/prompt-log on|off|status`). Claude Code només llegeix skills de `~/.claude/skills/`, així que cal copiar-hi la carpeta. Afegeix `.claude/prompt-log.active` al `.gitignore` de cada projecte on la facis servir.
