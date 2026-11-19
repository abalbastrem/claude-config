# claude-config

Configuració personal de Claude Code, compartida entre projectes.

- `CLAUDE.md`: preferències i flux de treball generals. El que és propi d'un projecte es queda al `CLAUDE.md` d'aquell projecte.

## Instal·lació

Claude Code llegeix `~/.claude/CLAUDE.md` a tots els projectes. Aquest fitxer només ha de contenir una línia que importi el d'aquest repo:

```
@~/projects/software/claude-config/CLAUDE.md
```

Per comprovar que s'aplica, executa `/memory` dins de Claude Code. El `CLAUDE.md` s'importa en lloc d'enllaçar-se perquè `@` és el mecanisme propi de Claude Code i funciona a qualsevol màquina, sense cap requisit.

La resta (agents, skills i la barra d'estat) l'enllaça `install.sh`, que també hi fusiona els settings compartits (vegeu més avall). Claude Code només llegeix aquestes peces de `~/.claude/`, i amb un enllaç simbòlic llegeix el fitxer del repo tal com està, en lloc d'una còpia que es pot desfasar:

```bash
./install.sh
```

Crea com a enllaços cap a aquest repo `~/.claude/agents`, una carpeta `~/.claude/skills/<nom>` per cada skill de `skills/` (una skill nova s'afegeix a la llista de `install.sh` i a `test-install.sh`) i `~/.claude/statusline-command.sh`. És idempotent: es pot tornar a executar després de clonar o quan s'hi afegeixi un enllaç. El que ja hi hagués i no fos l'enllaç bo es mou a una carpeta pròpia, `~/.claude/backup-AAAAMMDD-HHMMSS-XXXX/`, i mai no s'esborra. Si un enllaç antic apuntava a un altre lloc, el log diu on.

Abans de tocar res, comprova que hi són tots els fitxers del repo. També comprova que ni `~/.claude` ni `~/.claude/skills` siguin enllaços: si ho fossin, escriuria a través seu, potser dins d'aquest mateix repo, i per això s'atura.

**Settings.** El `~/.claude/settings.json` no s'enllaça: Claude Code el reescriu, i hi ha coses d'aquesta màquina, com rutes locals o regles de l'auto mode que parlen dels teus repos. Per això `settings.shared.json` porta només el que és compartible: els permisos `deny` i `ask`, els hooks, la barra d'estat i les regles generals de l'auto mode. `install.sh` el fusiona al teu `settings.json`:

- objecte per objecte, i a les llistes només hi afegeix el que falta;
- un valor que ja tens sempre guanya;
- `{{CLAUDE_CONFIG}}` es converteix en la ruta d'aquest repo (amb `~` si és dins del `HOME`);
- abans d'escriure, en desa una còpia al backup;
- si no hi ha res a afegir, no el toca.

Per treure una regla compartida, treu-la de `settings.shared.json` **i** del teu `settings.json`: la fusió només afegeix.

**Per sistema:**

- **macOS i Linux:** funciona tal com està.
- **Windows:** cal el mode de desenvolupador (*Configuració → Sistema → Per a desenvolupadors*), que deixa crear enllaços simbòlics sense permisos d'administrador, i executar-lo des de Git Bash. Sense aquest mode, el `ln -s` de Git Bash fa una còpia en silenci. Per això `install.sh` fa servir `MSYS=winsymlinks:nativestrict`, i s'atura si no pot crear un enllaç de veritat. Si també vols que `ln -s` es comporti així fora de l'script, posa `export MSYS=winsymlinks:nativestrict` al teu `~/.bashrc`.

**Prova.** `./test-install.sh` l'executa en un `HOME` temporal i sobre una còpia temporal del repo, i en acabar ho esborra tot. No toca mai `~/.claude` ni el repo de debò. El workflow `test-install.yml` el corre a cada PR, en Linux i en Windows.

## Hooks

- `hooks/notify-sound.sh`: fa sonar un avís de Windows quan Claude Code fa una pregunta, demana un permís o acaba. Necessita Windows i `python` al `PATH`.
- `hooks/prompt-log.sh`: mentre existeix `.claude/prompt-log.active` al projecte, afegeix cada prompt a `prompts.md` (número, model, eina i el prompt literal). Si el fitxer ja fa servir les etiquetes en castellà `**Modelo:**` / `**Herramienta:**`, les manté; si no, escriu `**Model:**` / `**Tool:**`. El fa servir la skill `prompt-log`. Necessita `jq`.

Els hooks es registren a `settings.shared.json`, i `install.sh` els afegeix al `settings.json`.

Els hooks, el `CLAUDE.md` i tot el que enllaça `install.sh` s'executen des d'aquesta carpeta tal com està, no des d'una còpia: si canvies de branca, canvia el que fa Claude a tots els projectes. Deixa la carpeta a `main` quan no hi estiguis treballant.

Els sons són a `hooks/sounds/` i vénen de Freesound. Per canviar-los, posa-hi un `.wav` (convertit amb `ffmpeg` si és un altre format) i canvia el nom de fitxer a `hooks/notify-sound.sh`. El canvi s'aplica de seguida, sense reiniciar.

### Crèdits dels sons

- Pregunta o permís: [alienbeacon1](https://freesound.org/s/455470/), de zimbot, a Freesound.
- Final del torn: [sci-fi computing tr1](https://freesound.org/s/786190/), de danymo, a Freesound. Convertit d'MP3 a WAV.

## Matriu de traçabilitat

`tools/matrix/` és una eina general que creua, per a qualsevol projecte amb OpenSpec:

- **els escenaris:** la spec viva i els changes en curs, cadascun amb un ID `[SC-n]` únic a tot el repo;
- **els resultats dels tests:** de Japa, Vitest i Playwright, els runners que l'eina sap llegir; un altre runner necessita un lector nou a `matrix.ts`. El títol de cada test comença per l'ID del seu escenari;
- **la cobertura de branques:** global i del codi nou respecte d'una branca base.

Ho fa amb tres fitxers:

- `matrix.ts` genera `matrix.md`, que es versiona i no porta l'estat dels tests, i `state.json`, que no es versiona. Amb `--check` falla si la matriu no està en verd: tests sense escenari, escenaris sense test o en vermell, resultats antics o `matrix.md` desfasat, entre altres. La llista sencera és a la skill `matrix`, «The rules it enforces». La cobertura no bloqueja mai.
- `matrix.ts --stamp` desa una empremta del contingut de les specs. El target de tests del projecte la crida just abans dels tests, i així el `--check` sap si els resultats són d'unes altres specs o si un runner no s'ha tornat a executar. No es fa per dates: un `pull` o un `touch` que no canvia res no compta.
- `server.ts` serveix `view.html` (per defecte a `http://localhost:5180`) i la repinta per SSE cada vegada que canvien les specs, els resultats, la cobertura o les classificacions, sense recarregar.
- **Anàlisi de branques:** la vista llista cada branca sense cobrir, per capa i per fitxer, amb el seu codi i, si ja s'ha classificat, la seva classe (criteri que falta, codi mort o defensiu, decisió tècnica o codi d'una altra Story). Les classificacions viuen al projecte, a `<dir>/branches.json`, versionades i amb la clau fitxer + text de la línia. `matrix.md` en mostra les classificades. La classe la posa l'agent, amb el motiu a `note` i, opcionalment, un `ref` a la discussió, i l'`adversarial-reviewer` comprova que s'aguanti llegint el codi. El que se'n derivi (un escenari nou, esborrar codi) ho decideix l'usuari (vegeu el `CLAUDE.md`, «Cap test sense criteri», i l'[ADR 0002](docs/adr/0002-aprovacio-per-pr.md)).
- La configuració de cada projecte viu al mateix projecte, a `<dir>/config.json`: els runners, on deixen els resultats, la branca base i els informes de cobertura.

Els projectes criden l'eina des d'aquesta carpeta, no en tenen una còpia:

```
node $CLAUDE_CONFIG/tools/matrix/matrix.ts --dir docs/traceability [--check] [--base <ref>]
node $CLAUDE_CONFIG/tools/matrix/server.ts --dir docs/traceability [--port 5180]
```

Per preparar-hi un projecte, la skill `skills/matrix/` (`/matrix setup`) crea la configuració, els targets de `make`, el hook pre-push (typecheck si el projecte en té, tests i `--check`, en aquest ordre; s'activa sol amb `npm install`) i la cobertura, i numera els escenaris. L'assignació de tests a escenaris te la proposa, però la decideixes tu.

L'eina no té tests propis expressament: només mostra els del projecte. Necessita Node 24 o posterior, que executa el TypeScript directament.

Com que tots els projectes l'executen des d'aquesta carpeta, l'eina avisa quan la carpeta no és a la seva branca per defecte o té canvis sense commit en qualsevol fitxer: en aquest cas, el `--check` de tots els projectes depèn d'aquesta branca.

### La matriu al CI

El hook pre-push és la porta local. `.github/workflows/matrix-check.yml` és la xarxa per al que se'l salta (`--no-verify`, un clon sense hooks, una edició des de la web, una altra persona): un workflow reutilitzable que executa els tests del projecte i `--check`, i posa el PR en vermell si la matriu no està al 100%. No necessita secrets, així que també corre en PR de forks.

```yaml
name: Traceability matrix
on:
  pull_request:
jobs:
  matrix:
    uses: abalbastrem/claude-config/.github/workflows/matrix-check.yml@main
    with:
      matrix-dir: docs/traceability
      setup: |
        npm ci
```

Va a `.github/workflows/matrix.yml` del projecte.

- **`setup`** instal·la i prepara el que necessiten els tests: dependències, fitxers d'entorn, migracions, navegadors dels E2E. Si el projecte no necessita res, `setup: 'true'`.
- **`test-command`** (per defecte, `make test`) executa tots els runners, primer amb `matrix.ts --stamp`, i deixa els resultats on diu `config.json`. El workflow passa `CLAUDE_CONFIG` amb la ruta de l'eina.
- **Seguretat:** ni `setup` ni `test-command` han de rebre valors de `github.event.*`, i el disparador ha de ser `pull_request`, mai `pull_request_target`, perquè executa el codi del PR.
- **Versió:** `@main` només existeix després del merge. L'eina sempre ve de `main`, encara que el workflow es fixi a una altra versió.
- **Bloquejar:** el check en vermell només impedeix el merge si està marcat com a obligatori a la protecció de la branca.
- **Cobertura:** no la mesura, perquè `--check` no la fa servir mai.

## Agents

- `agents/adversarial-reviewer.md`: revisa un PR per trencar-lo, no per aprovar-lo. A més de bugs i seguretat, comprova les regles de tests del `CLAUDE.md`: que cada test pengi d'un criteri, el nivell de cada test, l'E2E i la classificació de la cobertura. Claude Code només llegeix agents d'usuari de `~/.claude/agents/`, que `install.sh` enllaça a `agents/`. Si un projecte té un agent amb el mateix nom a `.claude/agents/`, mana el del projecte.

### El revisor adversarial al CI

`.github/workflows/adversarial-review.yml` és un workflow reutilitzable. Qualsevol dels meus repos el crida, i a cada PR l'agent `adversarial-reviewer` hi deixa un comentari. És consultiu i no bloqueja el merge. Fa servir l'agent del projecte si n'hi ha a `.claude/agents/` i, si no, el d'aquest repo, amb aquest `CLAUDE.md` com a global.

Per activar-lo en un repo, s'hi afegeix `.github/workflows/adversarial-review.yml`:

```yaml
name: Adversarial review
on:
  pull_request:
    types: [opened, ready_for_review, labeled]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    uses: abalbastrem/claude-config/.github/workflows/adversarial-review.yml@main
    secrets:
      CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

I el secret `CLAUDE_CODE_OAUTH_TOKEN` (de `claude setup-token`) a *Settings → Secrets and variables → Actions* del repo.

- **`permissions` és obligatori:** un workflow reutilitzable no pot tenir més permisos que el que el crida, i sense `pull-requests: write` no pot comentar.
- **Quan corre:** quan s'obre un PR que no és un esborrany, quan un esborrany es marca com a llest i quan s'hi posa l'etiqueta `ai-review`. Per tornar-lo a llançar, cal treure l'etiqueta i tornar-la a posar. Com que l'agent obre els PR com a esborrany i els marca com a llestos després de la seva revisió local (`CLAUDE.md`, «Git i PR»), aquesta segona revisió corre sobre el PR ja corregit.
- **Idioma:** el del `CLAUDE.md` del projecte, a la base del PR, o el del `CLAUDE.md` d'aquest repo si el projecte no en té.
- **Forks i Dependabot:** els PR que en vénen se salten sense error, perquè GitHub no els passa els secrets. No ho arreglis canviant a `pull_request_target`: executaria el prompt amb secrets sobre codi d'algú altre.

**Seguretat.** El PR és entrada no fiable:

- La configuració del revisor (l'agent, `CLAUDE.md`, `AGENTS.md` i `.claude/settings.json`) surt de la **base** del PR. Així, un PR no pot reescriure el seu propi revisor.
- El codi del PR es descarrega a part i només per llegir-lo.
- No queda cap credencial al disc.
- El model no pot editar, ni sortir a internet, ni llegir `/proc` o `.git`, ni publicar res: torna la revisió com a resposta, i la publica un pas posterior en què no intervé cap model.
- Els projectes que el criden fan servir `@main`, així que un push aquí afecta tots els repos alhora.

## Skills

Claude Code només llegeix skills d'usuari de `~/.claude/skills/`, on `install.sh` les enllaça. Si un projecte té una skill amb el mateix nom, mana la del projecte.

- `skills/commit/`: un commit convencional amb el que hi ha a l'*staging*, en l'idioma del `CLAUDE.md` del projecte.
- `skills/priority-ticket/`: agafa el tiquet de Jira de més prioritat assignat a l'usuari i en comença la feina. Mou el tiquet segons la regla «Jira» del `CLAUDE.md`.
- `skills/matrix/`: munta i fa servir la matriu de traçabilitat (vegeu «Matriu de traçabilitat»).
- `skills/prompt-log/`: activa i desactiva el registre de prompts (`/prompt-log on|off|status`). Afegeix `.claude/prompt-log.active` al `.gitignore` de cada projecte on la facis servir.
