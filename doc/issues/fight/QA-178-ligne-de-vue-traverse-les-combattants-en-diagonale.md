---
id: QA-178
title: La ligne de vue passe à travers les combattants sur une diagonale non axiale
severity: P1
domain: fight
type: bug
status: fixed
session: 1
opened: 2026-11-04
closed:
fixed_in:
related: []
files:
  - packages/grid/src/area.ts
  - packages/grid/src/area.spec.ts
---

## Symptôme

En combat, un Piou Vert est ciblable alors que deux Pious s'intercalent
entre lui et le lanceur. En coordonnées iso (`cellToCoord`), lanceur en
(0,0), Pious en (0,-1) et (0,-2), cible en (2,-3). La case cible reçoit la
teinte claire « lançable » de l'overlay de portée, et le serveur accepte le
sort.

## Attendu (1.29)

`Pathfinding.checkView` refuse la ligne de vue : (0,-1) est occupée et se
trouve sur le trajet.

## Cause

`hasLineOfSight` (`packages/grid/src/area.ts`) parcourait le segment avec un
Bresenham. Celui-ci fait un pas diagonal dès que le terme d'erreur le
permet, et saute alors l'une des deux cases réellement traversées. De (0,0)
à (2,-3), il testait (1,-1) (1,-2). Le client retail
(`Pathfinding.getCellsIdBetween`, dans
`assets/sources/client-code/ank/battlefield/utils/Pathfinding.as`) teste
(0,-1) (1,-1) (1,-2) (2,-2). Sur les décalages |dx|,|dy| ≤ 8, les deux
parcours diffèrent dans 192 cas sur 288. Le Bresenham n'était pas non plus
symétrique : A pouvait voir B sans que B voie A.

Le même code sert au serveur (`fight.cast.ts`), à l'overlay de portée
(`game-client.ts`), à l'aperçu au survol (`hover-preview.ts`) et au
ciblage (`fight-targeting.ts`). Le défaut touchait donc toutes ces vues à
la fois.

Écart secondaire : `checkView` refuse aussi une case cible dont
`lineOfSight` vaut `false`. On exemptait la cible de ce test.

## Correctif

`sightLineCoords` porte littéralement `getCellsIdBetween`, arithmétique
comprise : un parcours de grille (DDA) de centre à centre, qui avance sur
un axe à la fois et ne prend la diagonale que sur un coin exact
(`|tMaxX - tMaxY| < 1e-10`). `hasLineOfSight` s'appuie dessus et refuse
désormais une cible qui bloque la vue. L'occupant de la case cible ne
bloque toujours pas.

## Vérification

- `cd packages/grid && bun test src/` : le cas de la capture, la liste
  exacte des cases traversées, la règle du coin, la symétrie sur un
  voisinage 9×9 et la cible bloquante. Quatre de ces tests échouent sur
  l'ancien Bresenham.
- `bun run build` dans `packages/grid` : les apps importent `dist/`.
- À rejouer en jeu : recréer la configuration de la capture, puis vérifier
  que la case du Piou ciblé ne reçoit que la teinte foncée et que le
  serveur refuse le sort.
