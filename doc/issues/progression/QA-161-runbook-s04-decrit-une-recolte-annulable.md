---
id: QA-161
title: Le runbook S04 §8 décrit une récolte annulable au déplacement, que QA-143 a supprimée
severity: P3
domain: progression
type: bug
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-143, QA-123]
files:
  - doc/sprints/S04-metiers-recolte.md
  - apps/gameserver-ts/src/core/modules/harvest/harvest.service.ts:283
---

## Symptôme

Récolte lancée, puis clic sur une cellule éloignée pour se déplacer : le
personnage **ne bouge pas**, la jauge continue (5,0 s → 1,9 s), la récolte
aboutit et crédite normalement.

C'est le comportement voulu depuis QA-143 :

```ts
// A harvest is intentionally uncancellable by gameplay input. Movement
// is rejected by MoveHandler too; keeping this guard makes the invariant
// hold even if another caller accidentally reports a move here later.
if (why === "moved") {
  return;
}
```

Le runbook S04 §8 attend pourtant l'inverse, et en fait sa première des quatre
branches d'interruption :

> Quatre gestes, un par branche, tous pendant l'action :
> 1. cliquer ailleurs pour se déplacer ; […]
> **Attendu** — dans les quatre cas : aucune récompense, aucune expérience, et
> la ressource redevient disponible immédiatement.

Une recette exécutée à la lettre déclare donc un échec là où le code est juste.

## Portée

Les trois autres branches de §8 restent valides et ont été vérifiées :
changement de carte, combat, et fermeture brutale de l'onglet — cette dernière
libère bien la ressource sur-le-champ (`available_at` repassé dans le passé,
`reserved_by` effacé) sans verser de récompense.

## Correctif

Corriger le runbook S04 §8 : la branche 1 attend que le déplacement soit
**refusé** et que la récolte se poursuive, et renvoie à QA-143 pour la raison.

## Vérification

`doc/sprints/S04-metiers-recolte.md` §8 mentionne QA-143 et n'attend plus de
libération au déplacement.

## Résolution

S04 §8 est réécrit : la branche 1 attend désormais que le personnage **ne bouge
pas**, que la jauge continue et que la récolte aboutisse, en renvoyant à QA-143
pour la raison. Les trois autres branches restent inchangées et interrompent
toujours.
