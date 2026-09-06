---
id: QA-153
title: La récolte ne vérifie jamais la distance — on récolte à l'autre bout de la carte
severity: P1
domain: progression
type: gap
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-123, QA-114, QA-143, QA-146]
files:
  - apps/gameserver-ts/src/core/modules/harvest/harvest.service.ts:160
  - apps/gameserver-ts/src/core/modules/interactive-objects/interactive-objects.service.ts:37
  - packages/grid/src/area.ts
---

## Symptôme

Personnage posté à une trentaine de cellules de l'arbre, sans se déplacer :

```js
gameClient.sendInteractiveUse(313, 6)
```

L'action se joue, l'arbre tombe, le bois entre en inventaire, l'expérience est
créditée (`player_jobs.experience` 211 → 221). Aucun refus, aucun
avertissement.

Le même relevé a servi à récolter les 48 ressources de la carte de référence
8335 depuis une position fixe.

## Attendu (1.29)

`GA;500` n'est honoré que depuis une cellule adjacente à l'élément. Le client
canonique marche jusqu'à la ressource avant d'émettre ; le serveur re-teste,
parce qu'un client n'est pas une autorité.

## Cause

`HarvestService.start` (`harvest.service.ts:160`) enchaîne neuf gardes —
présence, combat, action déjà en cours, compétence, cellule récoltable,
métier, niveau, outil, énergie, surcharge, réservation — et **aucune** ne
porte sur la distance :

```
$ grep -n "adjacen\|distance\|fightDistance" src/core/modules/harvest/*.ts
(rien)
```

La seule occurrence du mot dans le chemin est un commentaire de
`interactive-objects.service.ts:37`, qui annonce « the same shape of check as
`validatePath`'s adjacency test » sans qu'aucun test n'existe.

Le sprint S04 affirme de son côté que « la récolte revalide sa propre
proximité », ce qui a probablement dispensé d'écrire le contrôle : QA-114 est
explicitement hors périmètre pour le *reste* du jeu, pas pour la récolte.

## Correctif

Dans `HarvestService.start`, après avoir résolu `gatherable`, refuser quand la
cellule du personnage n'est pas adjacente à `cellId`, avec la vraie adjacence
de `packages/grid/src/area.ts` (`±width` et `±(width-1)`, pas `±1`). La table
`HARVEST_DENIAL_MESSAGES` accueille le motif, par exemple `too-far` → « Vous
êtes trop loin de cette ressource. »

## Vérification

```js
// depuis une cellule non adjacente
gameClient.sendInteractiveUse(313, 6)
```

Attendu : refus `too-far`, message affiché, `gatherable_cell_states` inchangée.
Puis le parcours normal — clic sur l'arbre, approche automatique, récolte —
doit continuer de passer.

## Résolution

`HarvestService.start` teste l'adjacence juste après avoir résolu l'occurrence,
avec les huit directions de `getNeighbors` (`@dofus/grid`) et les dimensions de
`MapCacheService`. Motif `too-far` → « Vous êtes trop loin de cette
ressource. » dans `HARVEST_DENIAL_MESSAGES`.

**Une précision sur la mise en garde du correctif ci-dessus** : l'adjacence qui
compte ici est celle de la **marche**, pas celle du combat. `+1` est la case
plein est et elle *est* adjacente au sens du déplacement, alors que la métrique
de combat compte deux pas pour la même paire. Le bon ensemble est celui que le
client sait atteindre, parce que c'est `findAdjacentPath` — la même fonction,
sur les mêmes décalages — qui a choisi où se poster.

Relevé manette en main sur 8335 :

| position | `sendInteractiveUse(73, 6)` |
|---|---|
| cellule 88 (adjacente) | l'action part — ici « Quelqu'un récolte déjà cette ressource. », l'arbre étant en repousse |
| cellule 420 | **« Vous êtes trop loin de cette ressource. »** |

`gatherable_cell_states` ne bouge pas au refus : aucun `reserved_by`. Et le
parcours normal — clic sur l'arbre, approche automatique, récolte — passe
toujours, y compris depuis l'autre bout de la carte.

`harvest.service.spec.ts` couvre le refus depuis une cellule éloignée.
