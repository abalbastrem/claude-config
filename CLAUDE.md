# Manera general de treballar

Aquestes són les preferències per a tots els projectes. Si el `CLAUDE.md` d'un projecte diu una altra cosa, mana el del projecte.

## Entorn

- A Windows, fes servir sempre Git Bash, mai PowerShell.
- Els secrets i els tokens no passen mai pel xat: digue'm on els he de posar i els poso jo.

## De la idea al codi

Treballa per fases i atura't perquè revisi cada una abans de passar a la següent, perquè un error no es propagui cap avall:

PRD → Epics → Stories amb Given/When/Then → Subtasks → implementació amb TDD

- **PRD:** només decisions de producte, tan mínim com es pugui. Els casos límit van a les Stories, i no s'hi afegeixen requisits per protegir-se de l'ús indegut de l'eina.
- **Stories:** criteris Given/When/Then amb les paraules clau de l'RFC 2119 (MUST, MUST NOT). Tota la feina penja d'una Story: la preparació tècnica és una Subtask de la primera Story que la necessita.
- **Subtasks:** s'escriuen quan arriba la Story, no abans, i pensades per a TDD.
- **Decisions tècniques transversals:** un ADR a `docs/adr/` amb el perquè, i una referència curta al `CLAUDE.md` del projecte. Si s'han estudiat alternatives de veritat, l'ADR segueix el format [MADR](https://adr.github.io/madr/), amb les opcions considerades i per què s'han descartat.

## Tests

TDD diu quan escriure el test, no a quin nivell. Cada criteri es prova per defecte des de fora, i només es baixa de nivell quan compensa. Cada nivell té un paper:

| Nivell | Paper | Quants |
|---|---|---|
| **Endpoint:** HTTP i base de dades reals, sense simular-la | Prova **cada criteri** del backend, casos límit inclosos. És la base i va primer | Tots |
| **Component:** API simulada | Prova cada criteri **visual**: el que una persona veu i pot fer | Tots els que tenen pantalla |
| **E2E:** tot real | Prova que **la Story està connectada** de cap a cap, pel camí feliç. No verifica criteris: per això hi ha els dos nivells d'abans | Un per Story amb pantalla. Cap si la Story és només API o només una regla que l'endpoint ja cobreix |
| **Unitari** | Lògica amb massa combinacions per provar-la còmodament per l'endpoint, o decisions tècniques pròpies com reintents o traducció d'errors | L'excepció |

- No escriguis un test unitari de lògica simple (un `if` de dues branques, propagar un error): repeteix el codi, i el test d'endpoint ja el cobreix.
- Simular un servei extern i escriure un test unitari són decisions diferents. Un servei extern se simula sempre, perquè no controles quan falla, i la seva fallada es prova per la API si la funció no té lògica pròpia.

### Cap test sense criteri

Tot test penja d'un escenari de la Story, o d'una decisió tècnica que jo hagi acceptat. Un test sobre una branca que ningú no ha decidit converteix una casualitat en contracte.

Si mentre escrius els tests apareix una branca o un cas que cap criteri no recull, **atura't i porta-me'l**. No inventis l'escenari ni escriguis el test pel teu compte: decidir-ho és decisió de producte.

### Cobertura

La mètrica és la **cobertura de branques del codi nou de cada PR** (diff), no la global. És un detector, no un objectiu: no hi ha llindar que bloquegi el PR.

Quan tots els criteris passen, mira les branques del diff que cap test no recorre i classifica cadascuna al PR:

| Què és la branca | Què es fa |
|---|---|
| **Un criteri que falta:** comportament visible que importa a algú | Proposa l'escenari. Quan l'aprovo, va a la Story i després es fa el test |
| **Codi mort o defensiu:** no s'hi pot arribar, perquè una altra capa ja ho impedeix | S'esborra. Si es vol conservar, s'exclou de la cobertura explicant per què |
| **Decisió tècnica pròpia:** no la veu ningú, però el sistema la pren | Test unitari |
| **Codi d'una altra Story que s'ha avançat** | S'esborra fins que arribi la seva Story |

La cobertura no veu l'altre forat: una branca coberta per un test que no penja de cap criteri. Aquest el vigila la revisió del PR.

## Git i PR

- Una branca i un PR per a cada tema, amb prefixos convencionals: `feat/`, `fix/`, `docs/`, `test/`. No aprofitis una branca per colar-hi una altra correcció.
- En TDD, fes primer el commit `test:` i després el `feat:`, perquè es vegi que el test fallava.
- El merge dels PR es fa amb squash: els commits separats serveixen mentre es programa, no a l'historial final.
- Als forks, els PR i el seguiment de les branques apunten al meu fork, mai al repo original. Passa sempre `--repo` i `--base` a `gh pr create`.
- Quan em demanis fer el merge d'un PR, inclou-hi sempre l'enllaç sencer.
- Quan un revisor comenti un PR, resumeix-me el comentari i dona'm l'enllaç. Si la revisió es fa en local, publica-la al PR perquè en quedi constància.

## Jira

Si el projecte fa servir Jira, mou tu els tiquets, sense que t'ho demani: a In Progress en començar, i a Done quan s'ha fet el merge del seu últim PR.
