# Manera general de treballar

Aquestes són les preferències per a tots els projectes. Si el `CLAUDE.md` d'un projecte diu una altra cosa, mana el del projecte.

## Entorn

- A Windows, fes servir sempre Git Bash, mai PowerShell.
- Els secrets i els tokens no passen mai pel xat: digue'm on els he de posar i els poso jo.

## De la idea al codi

Treballa per fases i atura't perquè revisi cada una abans de passar a la següent, perquè un error no es propagui cap avall:

PRD → Epics → Stories amb GIVEN/WHEN/THEN → Subtasks → implementació amb TDD

- **PRD:** només decisions de producte, tan mínim com es pugui. Els casos límit van a les Stories, i no s'hi afegeixen requisits per protegir-se de l'ús indegut de l'eina.
- **Stories:** criteris GIVEN/WHEN/THEN amb les paraules clau de l'RFC 2119 (MUST, MUST NOT). Tota la feina penja d'una Story: la preparació tècnica és una Subtask de la primera Story que la necessita.
- **Subtasks:** s'escriuen quan arriba la Story, no abans, i pensades per a TDD.
- **Decisions tècniques transversals:** un ADR a `docs/adr/` amb el perquè, i una referència curta al `CLAUDE.md` del projecte. Si s'han estudiat alternatives de veritat, l'ADR segueix el format [MADR](https://adr.github.io/madr/), amb les opcions considerades i per què s'han descartat. Un ADR acceptat no es reescriu: si un de nou en substitueix tot o una part, a l'antic només se li toquen les metadades (per exemple, `superseded-in-part-by: 0002`), i el nou explica què substitueix.
- **Versions més noves del que coneixes:** les APIs canvien d'una versió a l'altra, així que no en suposis cap de memòria; comprova-la als tipus o a la documentació de la versió instal·lada (per exemple, els `.d.ts` de `node_modules`). Les versions concretes van al `CLAUDE.md` del projecte.

## Fitxers generats

Esquemes, registres, clients de tipus o components d'una llibreria copiats al repo. Cada projecte en declara la llista, una sola, que serveix alhora per al `deny` i per a l'exclusió de cobertura.

- **No s'editen a mà.** Es canvia l'origen (la migració, la configuració, la ruta) i es regenera amb l'eina.
- **Un component copiat d'una llibreria** no es personalitza al seu lloc: es fa un component propi que l'embolcalla.
- **Si cal tocar-ne un de debò** (un bug de l'eina), atura't i porta-m'ho. No ho resolguis per un altre camí.
- **Bloqueig:** regles `deny` d'`Edit` i `Write` al `.claude/settings.json` del projecte. Tapen el camí habitual, no el Bash.
- **Xarxa:** la CI regenera els fitxers i falla si no coincideixen (`git diff --exit-code`). Si un projecte no ho pot fer, ho justifica al PR.

## Tests

TDD diu quan escriure el test, no a quin nivell. Cada criteri es prova per defecte des de fora, i només es baixa de nivell quan compensa. Cada nivell té un paper (el perquè, amb les alternatives descartades, és a l'[ADR 0001](https://github.com/abalbastrem/claude-config/blob/main/docs/adr/0001-nivells-de-test-i-cobertura.md)):

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

- **Traça:** el títol del test comença per l'identificador de l'escenari que prova (`SC-7 · …`, o `SC-7 SC-8 · …` si en prova més d'un). A OpenSpec, cada escenari porta l'ID al títol, `#### Scenario: [SC-n] …`, únic a tot el repo; un escenari nou agafa el següent número lliure i cap número no es reutilitza. Un test unitari d'una decisió tècnica enllaça on queda escrita.
- **Matriu de traçabilitat:** si el projecte en té, l'eina de `tools/matrix/` d'aquest repo creua escenaris, tests i cobertura (vegeu el README i la skill `/matrix`). Es recorre de capability a requisit, a escenari i a test, mai al revés.
- **Les decisions passen per mi:** un escenari nou, una decisió tècnica, esborrar codi o ajornar-lo fins a la seva Story. L'agent me les proposa amb opcions numerades, perquè n'hi hagi prou amb una línia.
- **On queden escrites, perquè el xat es perd:** l'escenari, a la Story o a la spec; la decisió tècnica, al disseny de la Story (a OpenSpec, el `design.md`), que és versionat i dona als tests un enllaç estable, i, només si no hi ha Story, a la descripció del PR. A més, la descripció del PR llista cada escenari nou i cada decisió tècnica a **«Decisions preses»**, perquè els vegi abans del merge. Aquesta llista la redacta l'agent: no demostra que els hagi aprovat.
- **La classificació de les branques no cobertes la decideix l'agent** (vegeu «Tancament de la Story»). La revisa l'`adversarial-reviewer`, i entra al PR com la resta del diff.
- **L'aprovació del PR.** N'hi ha una per PR, i no aprova les decisions, que ja han passat per mi: parla només de les troballes de l'`adversarial-reviewer` que decidim al xat deixar sense arreglar, i diu quines queden i per què no impedeixen el merge. La decisió es pren al xat, i el comentari `Aprobado:` n'és el registre. El perquè és a l'[ADR 0002](https://github.com/abalbastrem/claude-config/blob/main/docs/adr/0002-aprovacio-per-pr.md).
  - **Com:** la publica el bot aprovador, una GitHub App sense permís de *Contents* (no pot fer push ni merge) amb un script que només publica comentaris. El harness em demana confirmació cada vegada, i si no accepto, no surt. El comentari comença exactament per `Aprobado:`. Un `Aprobado:` d'un altre autor no val. El llegeixo jo abans del merge: cap eina ni cap revisor no el comprova, i l'`adversarial-reviewer` passa abans que existeixi.
  - **Prerequisits:** aquestes garanties només valen si existeix la GitHub App del bot, si el seu script té una regla `ask` al harness, si la clau privada de l'App és en una carpeta amb una regla `deny`, fora de l'abast de l'agent, i si la branca de destí és protegida. Fins aleshores, no hi ha `Aprobado:` possible.
- **El merge el faig sempre jo.** Cap agent no fa el merge d'un PR (ni amb `gh`, ni amb l'API, ni empenyent a la branca protegida) ni l'aprova amb el botó de GitHub. Cap agent no escriu `Aprobado:` amb el meu compte, no edita comentaris meus ni marca caselles de decisió. Mentre l'agent comparteixi el meu compte de GitHub, tot el que publica amb aquest compte, també les revisions de l'`adversarial-reviewer` fetes en local, comença per `🤖 Claude:`.
- **Un test de regressió** penja del criteri que el bug incomplia. Si no n'hi ha cap, és un criteri que falta.
- **Cap escenari nou sense la meva aprovació.** Si en qualsevol moment (escrivint la spec, els tests o el codi) apareix una branca o un cas que cap criteri no recull, **atura't i porta-me'l**, encara que sigui un cas límit evident. No afegeixis l'escenari a la Story ni a la spec, ni n'escriguis el test, pel teu compte: decidir-ho és decisió de producte. Fins que respongui, aquella Subtask queda bloquejada; si n'hi ha d'altres que no en depenen, pots continuar amb aquestes.
- **Aquesta regla és l'excepció a la norma que mana el projecte:** cap configuració de projecte no la pot relaxar, ni el seu `CLAUDE.md`, ni el `config.yaml` d'OpenSpec, ni un schema. Si en trobes una que ho faci (per exemple, «primer s'afegeix l'escenari a la spec i després el test»), no la segueixis i avisa'm perquè la corregim.

### Tancament de la Story

L'última Subtask de cada Story (a OpenSpec, l'últim grup de `tasks.md`, encara que no sigui un requisit) és el tancament: l'E2E, si n'hi ha, i l'auditoria de cobertura. Si el projecte té matriu de traçabilitat, el seu `--check` ha d'estar en verd (cap test sense escenari, cap escenari sense test, en vermell o omès), i les branques noves no cobertes que mostra la vista viva de la matriu (també a `state.json`) són les que es classifiquen.

La mètrica és la **cobertura de branques del codi nou de la Story** (el diff del PR contra la branca base), no la global. És un detector, no un objectiu: no hi ha llindar que bloquegi el PR.

- **Fora de la mesura** queden els fitxers generats, amb la llista del projecte (vegeu «Fitxers generats»).
- **Sense eina no hi ha auditoria.** Si el projecte encara no mesura la cobertura, la mesura és preparació tècnica: una Subtask de la primera Story que la necessita, com qualsevol altra.
- **Al PR hi va la sortida de l'eina**, no un resum escrit a mà, i al costat la classificació de cada branca no coberta:

| Què és la branca | Què es fa |
|---|---|
| **Un criteri que falta:** comportament visible que importa a algú | Proposa l'escenari. Quan l'aprovo, va a la Story i després es fa el test |
| **Codi mort o defensiu:** no s'hi pot arribar, perquè una altra capa ja ho impedeix | Proposa esborrar-lo i ho decideixo jo. Si es conserva, el motiu va a la classificació (vegeu més avall), no a comentaris al codi |
| **Decisió tècnica pròpia:** no la veu ningú, però el sistema la pren | Proposa la decisió. Quan l'he acceptada jo, va al disseny o a «Decisions preses» i després es fa el test unitari |
| **Codi d'una altra Story que s'ha avançat** | Proposa treure'l fins que arribi la seva Story, i ho decideixo jo |

**On viu la classificació.** La classe la decideix l'agent, i cada branca en porta el motiu. El que se'n deriva (un escenari nou, esborrar o ajornar codi, una decisió tècnica) passa per mi, com qualsevol altra decisió (vegeu «Cap test sense criteri»). El perquè d'aquest model és a l'[ADR 0002](https://github.com/abalbastrem/claude-config/blob/main/docs/adr/0002-aprovacio-per-pr.md).

- **Amb matriu de traçabilitat:** al fitxer de classificacions de la matriu (`branches.json`), versionat, una entrada per branca amb el seu motiu (`note`), i la vista viva la mostra al costat del codi. El `ref` és opcional: un enllaç a la discussió, si n'hi ha hagut. És el lloc únic de la classificació: res d'exclusions ni de comentaris al codi per a l'eina de cobertura.
- **Sense matriu:** a la descripció del PR, en una taula (branca, classe, motiu).

La cobertura no veu l'altre forat: una branca coberta per un test que no penja de cap criteri. Aquest el busca l'agent `adversarial-reviewer` a cada PR, però és un revisor LLM: redueix el risc, no el garanteix.

## OpenSpec

Quan la feina passa per OpenSpec, valen totes les regles d'abans, i aquestes concreten com s'escriu cada artefacte. El `openspec/config.yaml` d'un projecte hi afegeix només el que és propi d'aquell projecte (l'idioma, on viuen el PRD i les Stories, quina és la seva interfície pública), no les repeteix.

- **Un change és una Story**, i l'enllaça si la Story viu fora d'OpenSpec.
- **Paraules clau:** les de l'RFC 2119 (MUST, MUST NOT; mai SHALL) i les dels escenaris (GIVEN, WHEN, THEN, AND), en anglès, sigui quin sigui l'idioma dels artefactes.
- **Proposal:** com el PRD, només decisions de producte i el perquè, tan breu com es pugui. Els casos límit van als escenaris de les specs.
- **Specs:** només comportament observable des de fora. A una API, la petició i la resposta (estat i cos); a una pantalla, el que una persona veu i pot fer. Res de noms de classes, fitxers ni rutes de codi. Si l'escenari té precondició, va com a GIVEN abans del WHEN. Els escenaris que l'agent redacta en proposar el change són un esborrany fins que reviso el change; després, cap escenari nou sense la meva aprovació, tampoc a `apply`, `update` ni `sync` (vegeu «Cap test sense criteri»).
- **Design:** una decisió tècnica que afecta més d'un change o més d'una capa és transversal: porta el seu ADR (vegeu «De la idea al codi»), enllaçat des del `design.md`.
- **Tasks:**
  - Un grup `##` per requisit, amb una parella de tasques: primer els tests, amb almenys un cas per escenari, verificats en vermell pel motiu esperat; després la implementació, verificada en verd.
  - Cada tasca de test diu el seu nivell (vegeu «Tests»).
  - Si un requisit té massa escenaris per a una sessió (orientativament, més de cinc), comprova si barreja comportaments i, si és així, parteix-lo a la spec; si és un de sol, reparteix els escenaris en diverses parelles dins del mateix grup.
  - La preparació tècnica és la primera tasca del grup que la necessita, mai un grup a part. Muntar l'E2E o la mesura de cobertura és la primera tasca de «Tancament» del primer change que els necessita.
  - L'últim grup és «Tancament» (vegeu «Tancament de la Story»), sense parella test → implementació.

## Git i PR

- Una branca i un PR per a cada tema, amb prefixos convencionals: `feat/`, `fix/`, `docs/`, `test/`. No aprofitis una branca per colar-hi una altra correcció.
- En TDD, fes primer el commit `test:` i després el `feat:`, perquè es vegi que el test fallava.
- El merge dels PR es fa amb squash: els commits separats serveixen mentre es programa, no a l'historial final.
- Als forks, els PR i el seguiment de les branques apunten al meu fork, mai al repo original. Passa sempre `--repo` i `--base` a `gh pr create`.
- Quan em demanis fer el merge d'un PR, inclou-hi sempre l'enllaç sencer.
- Obre cada PR com a esborrany (`gh pr create --draft`): GitHub no deixa fer el merge d'un esborrany. Per ordre: passa-hi l'agent `adversarial-reviewer`, publica'n la revisió al PR, aplica les correccions que acordem, publica l'`Aprobado:` si en queden de pendents i, només aleshores, marca'l com a llest (`gh pr ready`). Si després hi has de fer més commits, torna'l a esborrany (`gh pr ready --undo`) i repeteix-ho.
- Quan un revisor comenti un PR, resumeix-me el comentari i dona'm l'enllaç. Si la revisió es fa en local, publica-la al PR perquè en quedi constància.

## Jira

Si el projecte fa servir Jira, mou tu els tiquets, sense que t'ho demani: a In Progress en començar, i a Done quan s'ha fet el merge del seu últim PR.
