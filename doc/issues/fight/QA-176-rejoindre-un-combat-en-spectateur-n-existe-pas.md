---
id: QA-176
title: Rejoindre un combat en spectateur n'existe pas, donc l'option « interdire les spectateurs » ne garde rien
severity: P2
domain: fight
type: gap
status: open
session: 1
opened: 2026-09-10
closed:
fixed_in:
related: [QA-177]
files:
  - proto/game.proto
  - apps/gameserver-ts/src/core/features/game/fight-options/fight-options.handler.ts
  - apps/gameserver-ts/src/core/modules/fight/core/fight.entity.ts
---

## Symptôme

Le bouton « spectateurs » de la barre de préparation bascule bien : le serveur
enregistre `Fight.lockedSpectators` et diffuse le `GameFightOption` correspondant,
le client repeint l'œil barré. Mais aucun joueur ne peut de toute façon assister à
un combat, donc l'option n'interdit rien d'observable.

## Attendu (1.29)

Un joueur de la map clique sur les épées d'un combat en cours et le rejoint en
spectateur, à moins que le chef n'ait interdit les spectateurs. Le spectateur voit
la frise, les dégâts et le déroulé sans jouer, et peut sortir à tout moment.

## Cause

`ACTION_JOIN_SPECTATOR = 976` est déclaré dans `proto/game.proto` mais aucun
`@MessageHandler` ne le traite. `Fight.spectators` existe et est bien diffusé par
`Fight.allSessions()`, mais rien ne remplit jamais ce tableau. Côté client,
`fightStore` sait projeter un mode `spectating`, sans chemin pour y entrer.

## Correctif

Ajouter une tranche de rejointe en spectateur qui refuse quand
`fight.lockedSpectators` est vrai, pousse le joueur dans `Fight.spectators`, lui
envoie l'état complet du combat, et le retire à la sortie comme à la fin du combat.

## Vérification

Deux clients, un combat en cours. Le second rejoint en spectateur et voit la frise.
Le chef interdit les spectateurs, le second se fait refuser et le premier reste seul
dans le combat.
