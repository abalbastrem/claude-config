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
- **Decisions tècniques transversals:** un ADR a `docs/adr/` amb el perquè, i una referència curta al `CLAUDE.md` del projecte.

## Tests

TDD diu quan escriure el test, no a quin nivell. Cada criteri es prova per defecte des de fora, i només es baixa de nivell quan compensa:

| Nivell | Quan |
|---|---|
| **API:** HTTP i base de dades reals | Per defecte al backend |
| **Component:** API simulada | Per defecte al frontend |
| **E2E:** tot real | Pocs: recorreguts crítics i el que depèn que frontend i backend encaixin |
| **Unitari** | Només quan la lògica té massa combinacions per provar-les còmodament per la API, o decisions pròpies com reintents o traducció d'errors |

- No escriguis un test unitari de lògica simple (un `if` de dues branques, propagar un error): repeteix el codi, i la API ja el cobreix.
- Simular un servei extern i escriure un test unitari són decisions diferents. Un servei extern se simula sempre, perquè no controles quan falla, i la seva fallada es prova per la API si la funció no té lògica pròpia.

## Git i PR

- Una branca i un PR per a cada tema, amb prefixos convencionals: `feat/`, `fix/`, `docs/`, `test/`. No aprofitis una branca per colar-hi una altra correcció.
- En TDD, fes primer el commit `test:` i després el `feat:`, perquè es vegi que el test fallava.
- El merge dels PR es fa amb squash: els commits separats serveixen mentre es programa, no a l'historial final.
- Als forks, els PR i el seguiment de les branques apunten al meu fork, mai al repo original. Passa sempre `--repo` i `--base` a `gh pr create`.
- Quan em demanis fer el merge d'un PR, inclou-hi sempre l'enllaç sencer.
- Quan un revisor comenti un PR, resumeix-me el comentari i dona'm l'enllaç. Si la revisió es fa en local, publica-la al PR perquè en quedi constància.

## Jira

Si el projecte fa servir Jira, mou tu els tiquets, sense que t'ho demani: a In Progress en començar, i a Done quan s'ha fet el merge del seu últim PR.
