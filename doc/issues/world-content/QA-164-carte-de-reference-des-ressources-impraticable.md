---
id: QA-164
title: La carte de référence des ressources n'a pas de sol, et le panneau admin ne sait pas y aller
severity: P3
domain: world-content
type: data
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-124, QA-126, QA-129]
files:
  - apps/gameserver-ts/src/gateway/admin-accounts.ts
  - apps/electrobun/src/hud/admin/AdminDrawer.tsx:61
  - apps/electrobun/public/assets/data/navigation-manifest.json
---

## Symptôme

La carte **8335** porte une occurrence de **chacune des 48 ressources** des
cinq métiers de récolte — c'est la seule carte du monde où les cinq
coexistent. Elle est idéale pour recetter la récolte, et deux choses
l'empêchent de servir :

1. ~~**Elle n'a pas de sol praticable.**~~ **Faux — voir la résolution.** Les
   ressources sont alignées en rangées sur un fond noir, et l'absence de décor
   au sol a été prise pour une absence de sol. Un clic sur « Couper » ne
   partait pas ; la cause n'était pas la carte.
2. **Le panneau admin ne l'atteint pas.** « Vers une carte » n'accepte que les
   entrées de son index ; 8335 est en `[0, 0]`, hors du manifeste de
   navigation, et le bouton reste inactif quel qu'en soit l'identifiant saisi.
   Il a fallu écrire `players.map_id` en base puis reconnecter.

## Attendu

Une carte de référence sert à la recette : on doit pouvoir s'y téléporter et y
récolter au clic, comme partout ailleurs.

## Correctif

Deux gestes indépendants :

- accepter un identifiant de carte brut dans « Vers une carte » quand il ne
  correspond à aucune entrée indexée — l'action est déjà marquée « sensible »
  et auditée, la sécurité ne vient pas de l'index ;
- donner un sol praticable à 8335, ou la remplacer par une carte de recette
  entretenue à cet usage et documentée dans `doc/data-seeding.md`.

## Vérification

Panneau admin → « Vers une carte » → saisir `8335` → le bouton s'active, la
téléportation aboutit. Sur place, cliquer un Frêne puis « Couper » : le
personnage marche et récolte.

## Résolution

**Le premier point n'était pas reproductible, et le relevé le contredit.**
8335 porte 479 cellules, **toutes marchables** (`movement` 4 sur 456, 1 sur 23),
côté serveur comme côté client (`cellDataMap` renvoie `walkable: true` partout).
`DofusPathfinding.findAdjacentPath` trouve un chemin vers **les 48** ressources
depuis n'importe où. Manette en main : le personnage traverse la carte au clic,
puis un clic sur le Frêne → « Couper » le fait **marcher jusqu'à l'arbre et
récolter** — `itemAdd` Bois de Frêne, `jobXp` +10.

Ce qui bloquait réellement la session 8 est le **second** point, et lui seul :
faute de pouvoir se téléporter sur 8335, la carte a été parcourue en émettant
`GA;500` depuis une position fixe — ce que QA-153 interdit désormais.

**Ce qui a changé** : « Vers une carte » accepte un identifiant brut quand il ne
correspond à aucune entrée indexée (`AdminDrawer.typedMapId`). L'index n'est pas
ce qui rend la commande sûre — elle est marquée « sensible » et auditée — et le
refuser interdisait exactement les cartes que l'index oublie. Relevé :
`teleport_target_to_map` avec `mapId 8335`, `result success`, `players.map_id`
à 8335.

**Le sol de 8335 n'est pas modifié**, parce qu'il n'a jamais eu besoin de
l'être.
