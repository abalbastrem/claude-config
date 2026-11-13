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
| **Interfície pública:** el sistema real, amb les dependències pròpies (base de dades inclosa) sense simular. Cada projecte diu quina és la seva interfície: un endpoint HTTP, una comanda de CLI o l'API d'una llibreria | Prova **cada criteri**, casos límit inclosos. És la base i va primer | Tots |
| **Component:** el que hi ha darrere de la pantalla, simulat | Prova cada criteri **visual**: el que una persona veu i pot fer | Tots els que tenen pantalla |
| **E2E:** tot real | Prova que **la Story està connectada** de cap a cap, pel camí feliç. No verifica criteris: per això hi ha els dos nivells d'abans | Un per Story amb pantalla. Cap si la Story no en té. Saltar-se'l amb pantalla es justifica al PR |
| **Unitari** | Lògica amb massa combinacions per provar-la còmodament per la interfície pública, o decisions tècniques pròpies com reintents o traducció d'errors | L'excepció |

- No escriguis un test unitari de lògica simple (un `if` de dues branques, propagar un error): repeteix el codi, i el test d'interfície pública ja el cobreix.
- Simular un servei extern i escriure un test unitari són decisions diferents. Un servei extern se simula sempre, perquè no controles quan falla, i la seva fallada es prova per la interfície pública si la funció no té lògica pròpia.

### Cap test sense criteri

Tot test penja d'un escenari de la Story, o d'una decisió tècnica que jo hagi acceptat. Un test sobre una branca que ningú no ha decidit converteix una casualitat en contracte.

- **Traça:** el títol del test porta l'identificador del criteri que prova (per exemple, `CA-9`). Un test unitari d'una decisió tècnica enllaça on la vaig acceptar.
- **Una decisió tècnica és acceptada** quan hi ha un comentari meu al PR o queda escrita al disseny de la Story (a OpenSpec, el `design.md`) i jo l'he revisat. Que l'agent l'escrigui a la descripció del PR no compta.
- **Un test de regressió** penja del criteri que el bug incomplia. Si no n'hi ha cap, és un criteri que falta.
- Si mentre escrius els tests apareix una branca o un cas que cap criteri no recull, **atura't i porta-me'l**. No inventis l'escenari ni escriguis el test pel teu compte: decidir-ho és decisió de producte. Fins que respongui, aquella Subtask queda bloquejada; si n'hi ha d'altres que no en depenen, pots continuar amb aquestes.

### Tancament de la Story

L'última Subtask de cada Story (a OpenSpec, l'últim grup de `tasks.md`, encara que no sigui un requisit) és el tancament: l'E2E, si n'hi ha, i l'auditoria de cobertura.

La mètrica és la **cobertura de branques del codi nou de la Story** (el diff del PR contra la branca base), no la global. És un detector, no un objectiu: no hi ha llindar que bloquegi el PR.

- **Fora de la mesura** queda el codi generat (components d'una llibreria que no s'editen a mà, esquemes i registres autogenerats). Cada projecte en declara la llista a la configuració de cobertura.
- **Sense eina no hi ha auditoria.** Si el projecte encara no mesura la cobertura, la mesura és preparació tècnica: una Subtask de la primera Story que la necessita, com qualsevol altra.
- **Al PR hi va la sortida de l'eina**, no un resum escrit a mà, i al costat la classificació de cada branca no coberta:

| Què és la branca | Què es fa |
|---|---|
| **Un criteri que falta:** comportament visible que importa a algú | Proposa l'escenari. Quan l'aprovo, va a la Story i després es fa el test |
| **Codi mort o defensiu:** no s'hi pot arribar, perquè una altra capa ja ho impedeix | Proposa esborrar-lo i ho decideixo jo. Si es conserva, s'exclou de la cobertura explicant per què al mateix codi |
| **Decisió tècnica pròpia:** no la veu ningú, però el sistema la pren | Test unitari, un cop acceptada la decisió |
| **Codi d'una altra Story que s'ha avançat** | Proposa treure'l fins que arribi la seva Story, i ho decideixo jo |

La cobertura no veu l'altre forat: una branca coberta per un test que no penja de cap criteri. Aquest el busca l'agent `adversarial-reviewer` a cada PR, però és un revisor LLM: redueix el risc, no el garanteix.

Aquestes regles valen igual quan la feina passa per OpenSpec. Les regles del `openspec/config.yaml` d'un projecte hi afegeixen el que és propi d'aquell projecte, no les repeteixen.

**«Cap escenari nou sense la meva aprovació» és l'excepció a la norma que mana el projecte.** Cap configuració de projecte la pot relaxar: ni el seu `CLAUDE.md`, ni el `config.yaml` d'OpenSpec, ni un schema. Si en trobes una que digui una altra cosa (per exemple, «primer s'afegeix l'escenari a la spec i després el test»), no la segueixis: avisa'm perquè la corregim.

## Git i PR

- Una branca i un PR per a cada tema, amb prefixos convencionals: `feat/`, `fix/`, `docs/`, `test/`. No aprofitis una branca per colar-hi una altra correcció.
- En TDD, fes primer el commit `test:` i després el `feat:`, perquè es vegi que el test fallava.
- El merge dels PR es fa amb squash: els commits separats serveixen mentre es programa, no a l'historial final.
- Als forks, els PR i el seguiment de les branques apunten al meu fork, mai al repo original. Passa sempre `--repo` i `--base` a `gh pr create`.
- Quan em demanis fer el merge d'un PR, inclou-hi sempre l'enllaç sencer.
- Després d'obrir un PR, passa-hi l'agent `adversarial-reviewer` abans de donar-lo per acabat, i publica'n la revisió al PR.
- Quan un revisor comenti un PR, resumeix-me el comentari i dona'm l'enllaç. Si la revisió es fa en local, publica-la al PR perquè en quedi constància.

## Jira

Si el projecte fa servir Jira, mou tu els tiquets, sense que t'ho demani: a In Progress en començar, i a Done quan s'ha fet el merge del seu últim PR.
