---
id: QA-160
title: Apprendre un métier ne renvoie pas la trame de poids — les pods maximum restent en arrière
severity: P2
domain: progression
type: bug
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-133, QA-130, QA-140]
files:
  - apps/gameserver-ts/src/core/modules/jobs/jobs.service.ts:73
  - apps/gameserver-ts/src/core/modules/inventory/inventory.service.ts:244
  - apps/gameserver-ts/src/core/modules/harvest/harvest.service.ts:437
---

## Symptôme

Relevé de la trame `Ow` (`ItemWeight`) côté client, autour des trois gestes qui
changent le bonus de pods :

| geste | `Ow` renvoyée | `maxWeight` |
|---|---|---|
| oubli d'un métier niveau 3 | **oui** | 1 145 → 1 130 (−15 = 5 × 3) ✔ |
| passage de niveau en récoltant | **oui** | ✔ |
| **apprentissage d'un métier** | **non** | reste à 1 130 |

Après avoir appris Bûcheron chez Oli Venders, les seules trames reçues sont
`jobSkills` et `jobXp`. Le client continue d'afficher l'ancien maximum jusqu'à
ce qu'un autre événement provoque un `sendStats`.

## Attendu

QA-133 : cinq pods par niveau de métier, et « la trame de statistiques doit
être renvoyée après le passage de niveau ». Un métier appris vaut niveau 1,
donc cinq pods, immédiatement.

## Cause

`JobsService.learn` (`jobs.service.ts:73`) n'envoie que la liste des métiers :

```ts
await this.repo.insertPlayerJob(playerId, jobId);
this.frames.sendAll(sessionId, await this.statesFor(playerId));
```

Les deux autres chemins passent, eux, par `StatsService.sendStats` — la récolte
le fait explicitement (`harvest.service.ts:437`, « A level bought pods
(QA-133), and the weight frame is the only… »), et l'oubli en hérite parce
qu'il traverse `InventoryService.consumeOne`.

## Correctif

Appeler `StatsService.sendStats` après un apprentissage réussi, comme le fait
déjà le passage de niveau. ~~La dépendance existe déjà dans le module.~~ Elle
n'existe pas : `StatsModule` importe `JobsModule`, donc `JobsService` ne peut
pas l'appeler sans boucler. Le point d'appel est la tranche appelante — voir
la résolution.

## Vérification

Relever `maxWeight` de la trame `Ow`, apprendre un métier, relever à nouveau :
**+5** sans aucun autre geste. Puis oublier ce métier : **−5**.

## Résolution

`sendStats` est appelé à la fin de `NpcDialogHandler.learnJob`, pas dans
`JobsService.learn` : **la dépendance n'existait pas dans le module**, contrairement
à ce qu'annonçait le correctif ci-dessus. `StatsModule` importe `JobsModule`, donc
l'inverse boucle. Les deux autres chemins étaient déjà couverts — la potion passe
par `item-use.handler`, qui envoie les stats après tout usage réussi — et le
dialogue PNJ était le dernier à ne pas le faire.

Relevé manette en main, chez Contremaître Ikul : `jobSkills`, `jobXp`, puis
**`itemWeight`** dans la même salve, `maxWeight` **1430 → 1435**, sans changer de
carte. `npc-dialog.handler.spec.ts` couvre le cas.
