---
id: QA-177
title: L'option « équipe seulement » est diffusée sans être appliquée — il n'y a pas de module groupe
severity: P2
domain: fight
type: gap
status: open
session: 1
opened: 2026-09-10
closed:
fixed_in:
related: [QA-176]
files:
  - apps/gameserver-ts/src/core/features/game/fight-options/fight-options.handler.ts
  - apps/gameserver-ts/src/core/features/game/fight-join/fight-join.handler.ts
  - apps/gameserver-ts/src/core/modules/fight/core/fight.entity.ts
---

## Symptôme

`FightBlockJoinExceptPartyRequest` est reçu, bascule `Fight.partyOnly` et est
rediffusé, mais `fight-join.handler.ts` ne teste que `fight.lockedTeam`. Un joueur
hors groupe rejoint donc un combat marqué « équipe seulement ».

## Attendu (1.29)

Le chef restreint la rejointe aux membres de son groupe. Les autres joueurs de la
map voient les épées mais se font refuser.

## Cause

Il n'existe aucun module groupe dans `apps/gameserver-ts/src/core/modules/`, donc
aucune appartenance à tester. Le verrou complet (`lockedTeam`) est appliqué, celui-ci
ne peut pas l'être.

## Correctif

Après l'arrivée d'un module groupe, ajouter la garde dans `fight-join.handler.ts` :
refuser quand `fight.partyOnly` est vrai et que le demandeur n'appartient pas au
groupe du chef de l'équipe visée.

## Vérification

Trois clients. Le chef active « équipe seulement ». Un joueur de son groupe rejoint,
un joueur hors groupe se fait refuser.
