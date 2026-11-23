---
status: proposed
date: 2026-11-22
decision-makers: abalbastrem
---

# 0003 — El codi de metaprojecte queda fora del flux de producte i de la cobertura

Substitueix una part de l'[ADR 0001](0001-nivells-de-test-i-cobertura.md): el punt «L'anàlisi de branques» de la «Nota d'actualització», en tot el que diu que cap branca no surt de la mesura per exclusions de l'eina de cobertura. Per al codi de metaprojecte, l'exclusió és justament el camí. Per al codi del producte, el 0001 continua vigent: la classificació viu a `branches.json`.

La regla que se'n desprèn és a la secció «Codi de metaprojecte» del `CLAUDE.md` d'aquest repo.

## Context i problema

Tota la feina penja d'una Story, i tota branca nova sense cobrir es classifica. Però no tot el codi d'un repo és el producte. A flowsync (PR #37) es va afegir un visor d'OpenAPI per consultar l'API en desenvolupament. Les rutes es registren només amb `app.inDev`, i aquesta branca, que els tests no exerciten mai, va aparèixer a l'auditoria com a «branca nova sense classificar».

Classificar-la no tenia sentit. No és un criteri que falti, ni codi mort, ni codi d'una altra Story. Com a «decisió tècnica», demanaria un test unitari d'una eina que no és producte. Al PR no hi ha cap Story ni escenari d'on pugui penjar el test.

## Factors de decisió

- Que l'auditoria de branques parli només del producte, que és on detecta criteris que falten.
- Que no calgui inventar Stories, escenaris ni tests per a eines de desenvolupament.
- Que no sigui una porta oberta: el codi del producte no s'ha de poder amagar com a metaprojecte.
- Que els fitxers de metaprojecte continuïn sent editables a mà, a diferència dels generats.

## Opcions considerades

1. **Classificar cada branca a `branches.json`**, com qualsevol altra. Descartada: cap classe no hi encaixa, i la de «decisió tècnica» porta a un test sense criteri.
2. **Afegir-los a la llista de fitxers generats**, que ja serveix per a l'exclusió de cobertura. Descartada: la mateixa llista alimenta el `deny` d'edició, i aquests fitxers s'han de poder editar.
3. **Una llista pròpia de metaprojecte, només per a l'exclusió de cobertura**, amb el codi en fitxers seus i l'entrada a la llista decidida per la persona.

## Decisió

L'opció 3.

La definició i les regles són en un sol lloc, la secció «Codi de metaprojecte» del `CLAUDE.md`. Una línia d'«Abast» al principi del document deixa aquest codi fora de les regles de flux, sense excepcions repartides per cada regla. En resum:

- **Fora del flux:** no penja de cap Story, no porta escenaris ni tests, i queda fora de la mesura de cobertura.
- **Límit:** no ho és mai el que una persona usuària del producte veu o fa servir, ni el que s'executa a producció.
- **En fitxers propis**, amb una llista per projecte separada de la de fitxers generats, que compta per a l'exclusió de cobertura però no per al `deny`.
- **Passa per la persona:** entrar a la llista i qualsevol canvi en un fitxer que ja hi és surten a «Decisions preses». L'`adversarial-reviewer` els contrasta amb la definició.

### Conseqüències

- **Bo:** l'auditoria de branques deixa de mostrar soroll que no és producte.
- **Bo:** les eines de desenvolupament no necessiten Stories ni tests artificials.
- **Dolent:** és un forat de mesura. Un fitxer mal posat a la llista amaga comportament del producte. El mitiguen la decisió de la persona i el revisor, que és un LLM consultiu.
- **Dolent:** obliga a separar en fitxers propis codi que, d'una altra manera, aniria en una línia dins d'un fitxer del producte, com la crida que registra les rutes.

### Confirmació

A flowsync (PR #37), el registre de les rutes d'OpenAPI passa a un fitxer propi (`start/openapi.ts`). Aquest fitxer s'exclou de la cobertura a `.c8rc.json`. `config/openapi.ts` també és a la llista del projecte, però no cal excloure'l, perquè c8 només mesura `app/` i `start/`. La classificació de la branca `app.inDev` desapareix de `branches.json`.
