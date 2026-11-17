---
status: accepted
date: 2026-11-13
updated: 2026-11-17
---

# 0001 — Nivells de test per Story i cobertura de branques com a detector

Decisió presa a flowsync (PR #26, tancat perquè les regles passessin al flux global) i que ara regeix tots els projectes a través de la secció «Tests» del `CLAUDE.md` d'aquest repo. Aquí queda el perquè.

## Context i problema

La unitat de feina és la Story, i cada criteri es prova per defecte des de fora. Fins aleshores l'E2E era «pocs, només recorreguts crítics», sense cap regla sobre quan tocava, i la cobertura no es mesurava. Això deixava dues preguntes obertes:

- **Quin nivell prova que una Story està feta?** Un endpoint en verd i un component en verd amb l'API simulada no garanteixen que el frontend i el backend encaixin.
- **Com es detecta el comportament que ningú no ha decidit?** Una branca que no surt de cap criteri pot quedar sense test, i ningú no se n'adona. També pot acabar amb un test inventat, que la converteix en contracte sense que ningú ho hagi decidit.

## Factors de decisió

- Que cada criteri, casos límit inclosos, es provi de manera ràpida i determinista.
- Que hi hagi una prova que la Story funciona sencera, tal com la veu una persona.
- Que els tests no fixin com a contracte un comportament que cap criteri no demana.
- El cost de manteniment: els E2E són lents i fràgils, i quan fallen no diuen on és la fallada.

## Opcions considerades

1. **L'E2E com a test principal de cada Story**, que en verifica els criteris per la pantalla.
2. **Només interfície pública i component**, amb E2E únicament per als recorreguts crítics (el que hi havia).
3. **Repartiment per papers:**
   - interfície pública per a cada criteri;
   - component per a cada criteri visual;
   - un E2E per Story amb pantalla, només pel camí feliç;
   - unitari, com a excepció.

## Decisió

L'opció 3, i a més:

- **Cap test sense criteri.** Tot test penja d'un escenari o d'una decisió tècnica acceptada. Davant d'una branca que cap criteri no recull, l'agent s'atura i pregunta, en lloc d'inventar-se l'escenari i el seu test.
- **Cobertura de branques del codi nou de cada Story**, com a detector i sense cap llindar que bloquegi. Cada branca sense cobrir es classifica: criteri que falta, codi mort o defensiu, decisió tècnica pròpia (test unitari) o codi d'una altra Story.

### Conseqüències

- **Bo:** cada Story té una prova que està connectada, sense pagar el cost de verificar els criteris per la pantalla.
- **Bo:** les dues regles es complementen.
  - La cobertura caça les branques sense test.
  - La regla de no inventar criteris, vigilada pel revisor del PR, caça els tests sense criteri. La cobertura sola no veu aquest segon cas, perquè aquella branca surt en verd.
- **Dolent:** cal muntar la base d'E2E (Playwright, els dos servidors i una base de dades aïllada). És preparació tècnica de la primera Story amb pantalla que la necessiti, i fins aleshores les Stories ja tancades no tenen el seu E2E.
- **Dolent:** cal muntar la mesura de cobertura al backend i al frontend, també com a preparació de la primera Story que la necessiti.
- **Dolent:** la cobertura dels E2E no es mesura, perquè corren en processos a part. No cal: el que recorren ja ho cobreixen la interfície pública i el component.

### El que se n'ha après aplicant-la (2026-11-17)

A flowsync, aplicar la decisió va confirmar les conseqüències i va afegir tres peces que l'ADR original no preveia:

- **La matriu de traçabilitat** (`tools/matrix/`): creua els escenaris amb els tests i la cobertura.
  - El seu `--check`, al `pre-push` i al CI, és el que fa complir «cap test sense criteri» i «cap criteri sense test». La vigilància no queda només en mans del revisor.
- **L'anàlisi de branques:** la classificació de cada branca sense cobrir.
  - Viu, versionada, a `branches.json`, i la vista viva la mostra al costat del codi.
  - No viu en comentaris al codi ni en exclusions de l'eina de cobertura.
- **La marca `Aprobado:`:** la classificació, els escenaris nous i les decisions tècniques només compten quan la persona els aprova al PR. L'agent proposa i la persona decideix.

També va confirmar el paper de la cobertura com a detector, i no com a objectiu.
- L'auditoria del primer tancament va trobar comportament visible sense criteri (els errors de càrrega i d'alta). Aquest comportament sortia d'un requisit no funcional del PRD que mai no s'havia traduït a escenaris.
- La cobertura no va dir quins tests calia fer. Va assenyalar el forat, i el criteri va sortir del PRD.

### Confirmació

Es comprova a cinc llocs:
- **El grup de tancament** de les tasques de cada Story: hi ha l'E2E, si la Story té pantalla, i l'auditoria de cobertura.
- **`--check` de la matriu**, al `pre-push` i al CI: cap test sense escenari, cap escenari sense test.
- **La vista viva i `branches.json`:** cap branca nova sense classificar, i cada classificació amb el `ref` a la marca `Aprobado:`.
- **L'`adversarial-reviewer`, a cada PR:** la traça, el nivell de cada test i la classificació.
- **La secció «Tests» del `CLAUDE.md`**, que és la regla que se'n desprèn.

## Pros i contres de les opcions

### L'E2E com a test principal

- **Bo:** prova la Story tal com la veu la persona usuària, i serveix de criteri de «fet».
- **Dolent:** no hi caben tots els criteris, per pantalla. Una Story de flowsync en tenia 18; a la pràctica, l'E2E cobreix el camí feliç i poca cosa més.
- **Dolent:** és lent i fràgil, i quan falla no diu si la fallada és del frontend, del backend o de les dades.
- **Dolent:** no totes les Stories tenen pantalla.

### Només interfície pública i component

- **Bo:** és ràpid, determinista i cobreix tots els criteris amb un cost baix.
- **Dolent:** res no prova que el frontend i el backend encaixin. Els tipus generats a partir del contracte de l'API redueixen el forat, però no cobreixen els missatges d'error ni el comportament real.

### Repartiment per papers

- **Bo:** cada nivell fa el que sap fer: la interfície pública i el component verifiquen, i l'E2E connecta.
- **Dolent:** és l'opció que necessita més infraestructura de tests.
