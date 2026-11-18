---
status: proposed
date: 2026-11-18
decision-makers: abalbastrem
---

# 0002 — Una aprovació per PR, escrita per un bot que no pot fer el merge

Substitueix dues parts de l'[ADR 0001](0001-nivells-de-test-i-cobertura.md):

- la línia «Qui decideix: la persona» sobre la classificació de branques, a «Decisió»;
- el punt «La marca d'aprovació de la persona al PR», a la «Nota d'actualització».

La resta del 0001 continua vigent. La regla que se'n desprèn és a «Cap test sense criteri» i «Tancament de la Story», al `CLAUDE.md` d'aquest repo.

## Context i problema

Amb el model del 0001, cada decisió necessitava una marca pròpia de la persona al PR: cada escenari nou, cada decisió tècnica i cada classificació de branca. Era un comentari que començava per `Aprobado:` o `Rechazado:`, amb un abast per ítems (`Aprobado: 1 y 3`). Cada entrada de `branches.json` havia d'enllaçar la seva marca amb el `ref`.

A la pràctica:

- **Pesava massa.** Aprovar una per una decisions petites, com la classe d'una branca, convertia cada tancament de Story en una ronda de marques.
- **No garantia res.** L'agent publica amb el compte de la persona, i l'única cosa que distingia una marca de la persona d'un comentari de l'agent era el prefix `🤖 Claude:`, que posa el mateix agent.
- **Barrejava dues coses diferents:** decidir (escenaris, decisions tècniques) i acceptar que un PR es pot fusionar encara que la revisió hi hagi deixat troballes.

## Factors de decisió

- Que les decisions de producte i les tècniques continuïn passant per la persona.
- Que la persona escrigui com menys millor: decideix al xat, en una línia.
- Que quedi registre escrit del perquè d'un merge amb troballes obertes, perquè el xat es perd.
- Que cap agent no pugui fer el merge, i que el registre d'aprovació no el pugui escriure l'agent pel seu compte.

## Opcions considerades

1. **Una marca per decisió**, el model del 0001.
2. **Un `Aprobado:` per PR, amb el compte de la persona.**
3. **Un `Aprobado:` per PR, escrit per un bot que no pot fer el merge**, a través d'un script que el harness confirma amb la persona cada vegada.
4. **El botó natiu *Approve* de GitHub**, amb un compte bot que fa tota la feina de l'agent (branques, PR, comentaris) i una aprovació obligatòria al ruleset.

## Decisió

L'opció 3.

- **Les decisions** (escenari nou, decisió tècnica, esborrar o ajornar codi) es prenen al xat. L'agent les deixa escrites a la Story o al seu disseny (a la descripció del PR només si no hi ha Story), i les llista a la secció «Decisions preses» del PR. L'`adversarial-reviewer` assenyala les que el diff introdueix i no hi surten.
- **La classificació de les branques no cobertes la fa l'agent.** El motiu va a `note`, i el `ref` de `branches.json` passa a ser opcional: un enllaç a la discussió, si n'hi ha hagut. El que se'n derivi continua passant per la persona.
- **L'`Aprobado:` és un per PR, i parla només de les troballes de l'`adversarial-reviewer`:** quines queden i per què no impedeixen el merge. No aprova les decisions, que ja hi han passat. L'escriu el bot aprovador, una GitHub App amb permís de *Pull requests* i sense permís de *Contents*: no pot fer push ni merge. El permís de *Pull requests* també li permetria aprovar amb el botó *Approve*; no ho fa perquè el seu script només publica comentaris. L'script que el publica té una regla `ask` al harness, i la clau privada de l'App té una regla `deny` de lectura.
- **El merge el fa sempre la persona.**

### Conseqüències

- **Bo:** la persona decideix al xat i no ha d'escriure marques. El tancament d'una Story passa de diverses marques a cap, i el PR a una.
- **Bo:** l'autor de l'`Aprobado:` és el bot, no la persona: un comentari de l'agent amb el compte de la persona ja no es pot confondre amb una aprovació.
- **Bo:** que el bot no pugui fer el merge no depèn de cap instrucció: GitHub no el deixa fer sense permís de *Contents*.
- **Dolent:** una decisió ja no porta cap rastre verificable que demostri que va passar per la persona. Només hi ha la secció «Decisions preses», que redacta l'agent: demostra que una decisió consta, no que s'hagi aprovat. Això afebleix el control de «cap escenari nou sense la meva aprovació», que passa a dependre de la persona, que llegeix el PR abans del merge. És un risc assumit.
- **Dolent:** el bot podria aprovar un PR amb el botó *Approve*, perquè el permís de *Pull requests* ho permet. Només ho impedeix el seu script. Avui no té cap efecte, perquè cap ruleset no exigeix aprovacions.
- **Dolent:** una classificació de branca feta per l'agent pot tapar una branca sense test sense que ningú la miri. La mitiga l'`adversarial-reviewer`, que és un LLM consultiu.
- **Dolent:** cal crear i mantenir una GitHub App i el seu script. Fins que existeixin, no hi ha cap `Aprobado:` possible.
- **Dolent:** l'agent continua tenint el token de la persona, per fer push i obrir PR. Les regles `deny` sobre `gh pr merge` i les branques protegides tapen els camins habituals, però un script fet a mida contra l'API se les podria saltar.

### Confirmació

- El `CLAUDE.md` d'aquest repo, a «Cap test sense criteri», descriu el model i els seus prerequisits.
- L'`adversarial-reviewer` i el workflow `adversarial-review.yml` comproven la secció «Decisions preses» i ja no exigeixen cap marca per decisió ni cap `ref`.
- Un `Aprobado:` de prova surt amb l'autor del bot i demana confirmació al harness, i un merge amb el token de l'App falla.

## Pros i contres de les opcions

### Una marca per decisió

- **Bo:** cada decisió té el seu rastre, verificable per un revisor.
- **Dolent:** és car per a la persona, sobretot en les decisions petites.
- **Dolent:** l'autor no es pot verificar, perquè l'agent comparteix el compte de la persona.

### Un `Aprobado:` per PR amb el compte de la persona

- **Bo:** no cal cap infraestructura nova.
- **Dolent:** no distingeix la persona de l'agent, pel mateix motiu.

### Un bot que només comenta, amb confirmació al harness

- **Bo:** separa l'autor del registre de la persona, i el bot no té cap permís que li permeti fer el merge.
- **Bo:** la persona confirma cada publicació, i el text surt de la conversa.
- **Dolent:** cal una App, un script i regles al harness.

### El botó natiu *Approve*, amb un bot que fa tota la feina

- **Bo:** l'aprovació és nativa de GitHub, i un ruleset la pot exigir: és una porta determinista.
- **Dolent:** l'agent hauria de fer tota la feina amb el compte del bot, que per fer push de les branques necessita permís de *Contents*, i amb aquest permís també podria fer el merge.
- **Dolent:** és un canvi més gran del que cal per al problema.
