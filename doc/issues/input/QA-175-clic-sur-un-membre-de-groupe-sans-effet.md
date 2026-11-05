---
id: QA-175
title: Un clic sur un monstre autre que le leader marche jusqu'à lui sans lancer le combat
severity: P1
domain: input
type: bug
status: fixed
session: 1
opened: 2026-09-09
closed:
fixed_in:
related: [QA-094]
files:
  - apps/electrobun/src/game/scene/battlefield/picking.ts
  - apps/electrobun/src/game/scene/battlefield/world-actors.ts
  - apps/gameserver-ts/src/core/features/game/move-ack/move-ack.handler.ts
---

## Symptôme

Sur un groupe de plusieurs monstres, un seul sprite lance le combat. Cliquer
sur n'importe quel autre membre fait marcher le personnage jusqu'à la case de
ce membre, puis plus rien : pas d'écran de placement, aucun message, aucune
ligne dans `gamed.log`. Il faut viser le bon monstre parmi huit, sans que rien
à l'écran ne le désigne.

## Attendu (1.29)

Un groupe est **un** sprite avec ses membres accrochés en `linkedSprite`. Le
relâchement de souris remonte au parent (`DofusBattlefield.onSpriteRelease`),
si bien que n'importe quel membre du tas déclenche l'agression du groupe.

## Cause

Deux décisions correctes prises séparément, qui ne se croisaient nulle part.

Depuis [QA-094](../world-render/QA-094-membres-d-un-groupe-empiles-sur-une-case.md),
les membres non-leader sont des **sprites liés décoratifs** posés sur les cases
du ring autour du groupe (`PlayerRenderer.loadWithLinkedChildren` →
`PlayerMovement.aroundCell`), avec des ids alloués par un compteur privé au
renderer. Ni ces ids ni ces cases n'existent côté serveur : celui-ci n'émet
qu'une entrée sprite par groupe, sur une seule case
(`map-monster.sprite-entry.ts:24-55`).

Et il n'existe aucun message « attaquer » : le combat démarre en effet de bord
de l'ack de déplacement, quand la case d'arrivée est **exactement** celle du
groupe — `maybeTriggerPvM` → `findGroupAtCell(mapId, cellId)`, égalité stricte
(`move-ack.handler.ts:155`, `map-monster.service.ts:161-172`).

Le clic, lui, résolvait la case **du sprite cliqué** :

```ts
const cellId = this.deps.worldActorRenderer()?.getPlayerCell(playerId);
```

`picking.ts:754-763`. Sur un membre décoratif, cela désigne une case du ring —
le serveur n'y voit aucun groupe, `return false` sans log, et l'ack se termine
en marche ordinaire. Le survol, lui, traitait déjà le groupe comme une unité
via `groupSpriteIds` ; seul le clic avait été oublié.

## Correctif

`onObjectClick` remonte au leader avant de lire la case, via la liste
`pickableIdToGroupSpriteIds` que `world-actors.ts` renseigne déjà pour tous les
membres sous la forme `[leaderId, ...childIds]`. L'ordre de cette liste devient
un contrat, documenté aux deux bouts et verrouillé par un test.

Côté serveur, la sortie muette de `maybeTriggerPvM` passe en `debug` avec la
map et la case : c'est ce silence qui rendait le défaut illisible dans les
journaux.

## Vérification

```bash
cd apps/electrobun && bun test src/game/scene/battlefield/
```

Deux cas dans `picking.spec.ts` — un clic sur le membre lié et un clic sur le
leader arrivent tous deux sur la case du groupe — et un cas dans
`world-actors.spec.ts` qui fixe l'ordre leader-en-premier.

Manette en main : sur un groupe d'au moins trois monstres, cliquer un membre
autre que celui mis en avant ; le personnage marche jusqu'à la case du groupe
et l'écran de placement s'ouvre. Un clic sur une case vide adjacente au groupe
ne déclenche toujours rien.
