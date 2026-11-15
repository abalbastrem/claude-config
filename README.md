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
- **els resultats dels tests:** Japa, Vitest i Playwright. El títol de cada test comença per l'ID del seu escenari;
- **la cobertura de branques:** global i del codi nou respecte d'una branca base.

Ho fa amb tres fitxers:

- `matrix.ts` genera `matrix.md`, que es versiona i no porta l'estat dels tests, i `state.json`, que no es versiona. Amb `--check` falla si hi ha tests sense escenari, escenaris sense test, en vermell o només omesos, resultats que falten o antics, cap escenari, o si `matrix.md` està desfasat. Els errors de les specs (escenari sense ID, ID o requisit repetit) fan fallar qualsevol mode. La cobertura és informativa i no bloqueja mai.
- `matrix.ts --stamp` desa una empremta del contingut de les specs. El target de tests del projecte la crida just abans dels tests, i així el `--check` sap si els resultats són d'unes altres specs o si un runner no s'ha tornat a executar. No es fa per dates: un `pull` o un `touch` que no canvia res no compta.
- `server.ts` serveix `view.html` (per defecte a `http://localhost:5180`) i la repinta per SSE cada vegada que canvien les specs, els resultats, la cobertura o les classificacions, sense recarregar.
- **Anàlisi de branques:** la vista llista cada branca sense cobrir, per capa i per fitxer, amb el seu codi i, si ja s'ha decidit, la seva classe (criteri que falta, codi mort o defensiu, decisió tècnica o codi d'una altra Story). Les classificacions viuen al projecte, a `<dir>/branches.json`, versionades i amb la clau fitxer + text de la línia. `matrix.md` en mostra les classificades. Les proposa l'agent i les decideix l'usuari.
- La configuració de cada projecte viu al mateix projecte, a `<dir>/config.json`: els runners, on deixen els resultats, la branca base i els informes de cobertura.

Els projectes criden l'eina des d'aquesta carpeta, no en tenen una còpia:

```
node $CLAUDE_CONFIG/tools/matrix/matrix.ts --dir docs/traceability [--check] [--base <ref>]
node $CLAUDE_CONFIG/tools/matrix/server.ts --dir docs/traceability [--port 5180]
```

Per preparar-hi un projecte, la skill `skills/matrix/` (`/matrix setup`) crea la configuració, els targets de `make`, el hook pre-push (typecheck si el projecte en té, tests i `--check`, en aquest ordre; s'activa sol amb `npm install`) i la cobertura, i numera els escenaris. L'assignació de tests a escenaris te la proposa, però la decideixes tu. Com les altres skills, cal copiar-la a `~/.claude/skills/matrix/`.

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
        cd backend && npm ci && cp .env.example .env && node ace generate:key && node ace migration:run --force
        cd ../frontend && npm ci && npx playwright install --with-deps chromium
```

Va a `.github/workflows/matrix.yml` del projecte.

- **`setup`** instal·la i prepara el que necessiten els tests. Si el projecte no necessita res, `setup: 'true'`.
- **`test-command`** (per defecte, `make test`) executa tots els runners, primer amb `matrix.ts --stamp`, i deixa els resultats on diu `config.json`. El workflow passa `CLAUDE_CONFIG` amb la ruta de l'eina.
- **Seguretat:** ni `setup` ni `test-command` han de rebre valors de `github.event.*`, i el disparador ha de ser `pull_request`, mai `pull_request_target`, perquè executa el codi del PR.
- **Versió:** `@main` només existeix després del merge. L'eina sempre ve de `main`, encara que el workflow es fixi a una altra versió.
- **Bloquejar:** el check en vermell només impedeix el merge si està marcat com a obligatori a la protecció de la branca.
- **Cobertura:** no la mesura, perquè `--check` no la fa servir mai.

## Agents

- `agents/adversarial-reviewer.md`: revisa un PR per trencar-lo, no per aprovar-lo. A més de bugs i seguretat, comprova les regles de tests del `CLAUDE.md`: que cada test pengi d'un criteri, el nivell de cada test, l'E2E i la classificació de la cobertura. Claude Code només llegeix agents d'usuari de `~/.claude/agents/`, així que cal copiar-hi el fitxer. Si un projecte té un agent amb el mateix nom a `.claude/agents/`, mana el del projecte.

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
- **Quan corre:** quan s'obre un PR que no és un esborrany, quan un esborrany es marca com a llest i quan s'hi posa l'etiqueta `ai-review`. Per tornar-lo a llançar, cal treure l'etiqueta i tornar-la a posar.
- **Forks i Dependabot:** els PR que en vénen se salten sense error, perquè GitHub no els passa els secrets. No ho arreglis canviant a `pull_request_target`: executaria el prompt amb secrets sobre codi d'algú altre.

**Seguretat.** El PR és entrada no fiable:

- La configuració del revisor (l'agent, `CLAUDE.md`, `AGENTS.md` i `.claude/settings.json`) surt de la **base** del PR. Així, un PR no pot reescriure el seu propi revisor.
- El codi del PR es descarrega a part i només per llegir-lo.
- No queda cap credencial al disc.
- El model no pot editar, ni sortir a internet, ni llegir `/proc` o `.git`, ni publicar res: torna la revisió com a resposta, i la publica un pas posterior en què no intervé cap model.
- Els projectes que el criden fan servir `@main`, així que un push aquí afecta tots els repos alhora.

## Skills

- `skills/prompt-log/`: activa i desactiva el registre de prompts (`/prompt-log on|off|status`). Claude Code només llegeix skills de `~/.claude/skills/`, així que cal copiar-hi la carpeta. Afegeix `.claude/prompt-log.active` al `.gitignore` de cada projecte on la facis servir.
