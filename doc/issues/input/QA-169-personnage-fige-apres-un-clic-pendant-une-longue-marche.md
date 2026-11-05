---
id: QA-169
title: "Un clic pendant une longue marche fige le personnage jusqu'au changement de carte"
severity: P0
domain: input
type: bug
status: fixed
session: 9
opened: 2026-09-08
closed:
fixed_in:
related: [QA-092, QA-045]
files:
  - apps/electrobun/src/game/network/handlers/map.handler.ts:256
  - apps/electrobun/src/game/game-client.ts:2288
  - apps/gameserver-ts/src/core/features/game/move-ack/move-ack.handler.ts:51
  - apps/gameserver-ts/src/core/modules/player-presence/player-presence.pending-moves.service.ts
---

## Symptôme

Un clic lointain, le personnage traverse la carte, un deuxième clic pendant la
marche — et à l'arrivée il ne répond plus. Chaque clic suivant est soit avalé
sans rien, soit suivi d'une seconde ou deux d'inertie puis de rien. L'état ne se
répare jamais tout seul ; il faut changer de carte.

Relevé du bundle `2026-09-08T18-36-07-115Z`, marche de 11 cases partie de 312 :

```
18:34:58.353  Moving: 312 → 143 · 11 step(s)
18:34:58.355  gamed  move ok action=31              ← pending = 31
18:34:58.360  walk start seq=31                     ← écho reçu en 7 ms
18:35:00.396  WARN self-move timed out after 2000 ms with no echo
18:35:00.397  Moving: 312 → 345                     ← recalculé depuis la case de départ
18:35:00.398  gamed  move ok action=32              ← pending 31 écrasé
18:35:00.413  walk end seq=31 cell=142
18:35:00.414  WARN ack: id mismatch expected=32 got=31
18:35:01.207  WARN move: validate-path: not_adjacent at step 0 … from 312
```

Ensuite, six ordres de suite refusés `not_adjacent … from 312` : le serveur est
resté sur 312, le client se croit en 345.

## Attendu (1.29)

Un clic pendant une marche la **retarge** : le personnage s'arrête sur la case
qu'il est en train d'entrer et repart de là (`InteractionsManager.as`, câblé ici
par QA-092). Il n'existe jamais deux ordres de déplacement en vol pour un même
personnage.

## Cause

Quatre fautes en cascade, dont une seule est la racine.

**A — le chien de garde du verrou de clic couvrait la mauvaise fenêtre**
(`map.handler.ts:256`, `isSelfMoveInFlight`). `SELF_MOVE_TIMEOUT_MS` protège la
fenêtre *envoi → écho* : un chemin que le serveur refuse n'est jamais renvoyé et
ne doit pas retenir les clics. Mais `selfMoveSentAt` n'était effacé qu'à la **fin
de l'animation**, jamais à l'arrivée de l'écho — le compteur courait donc jusqu'à
la fin de la marche. Mesuré dans ce relevé : ~186 ms par case en course, ~500 ms
en marche, soit toute trajectoire de plus de ~11 cases (ou ~5 en marche) qui sort
du verrou **en pleine animation**. Le clic tombé dans ce trou ne passe plus par
`interruptThen()` (`game-client.ts:2288`) et devient un deuxième ordre.

**B — la case courante n'est écrite qu'à la fin de la marche**
(`map.handler.ts:757`). Ce deuxième ordre est donc calculé depuis la case de
*départ*. Inoffensif tant que A tient le verrou.

**C — le serveur accepte un déplacement alors qu'un autre est en attente**
(`move.handler.ts:113`) : il valide contre une position qu'il sait non commitée
et **écrase** son propre `pending` sans un mot.

**D — l'ack consommait le `pending` avant de vérifier l'id**
(`move-ack.handler.ts`, `take` = get-and-delete). L'ack tardif de l'action 31 a
donc détruit l'action 32, celle qu'on attendait vraiment. Plus rien à commiter :
le serveur reste sur 312 définitivement. C'est cette faute qui transforme un
hoquet en blocage permanent.

Cinquième point aggravant : un déplacement refusé par `tryValidate` ne renvoie
**rien** au client, dont la croyance n'est donc jamais corrigée.

## Correctif

A et D, les deux qui suffisent à casser la chaîne :

- `isSelfMoveInFlight()` rend `true` tant que la marche est animée (`isMoving`),
  quelle que soit sa durée. Le délai de 2 s ne couvre plus que la fenêtre
  envoi → écho, ce que son commentaire annonçait déjà.
- `MoveAckHandler` regarde le `pending` sans le consommer (`PendingMovesService.peek`),
  compare les ids, et ne le retire qu'une fois l'ack reconnu. Un ack périmé est
  ignoré et laisse l'action en vol intacte.

B, C et le silence sur refus restent ouverts — non nécessaires ici une fois A en
place, mais C laisse un client modifié créer la même divergence.

## Vérification

```bash
cd apps/gameserver-ts && bun test src/core/features/game/move-ack/
```

`move-ack.handler.spec.ts` : un ack nommant une action périmée laisse le
`pending` en place. Côté client, `map.handler.walk.spec.ts` (`describe("the self-move
lock")`) tient le verrou 5 s dans une marche en cours et le relâche
quand l'écho ne vient jamais.

Manette en main : cliquer à l'autre bout de la carte, recliquer ailleurs après
plus de deux secondes de marche. Attendu — le personnage s'arrête sur la case
qu'il entre et repart vers la nouvelle cible ; aucun `self-move timed out`,
aucun `id mismatch`, aucun `not_adjacent` dans le bundle.
