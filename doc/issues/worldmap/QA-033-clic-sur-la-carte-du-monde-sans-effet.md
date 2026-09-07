---
id: QA-033
title: Cliquer une case de la carte du monde ne fait rien
severity: P2
domain: worldmap
type: gap
status: fixed
session: 1
opened: 2026-08-20
closed:
fixed_in:
related: []
files: [apps/electrobun/src/hud/worldmap/WorldMapPanel.tsx:49]
---

## Symptôme

Le callback `onTeleport` se contente d'un
`console.log("World map teleport:", mapId)`.

## Attendu (1.29)

Ce n'est pas un manque en soi — le 1.29 ne téléporte pas non plus au clic. Mais
le survol n'affiche pas davantage le nom de la zone / sous-zone, qui est
l'usage principal de cet écran.

## Correctif

Le ticket dit l'essentiel : le manque n'est pas la téléportation — le 1.29
réserve `autorisedMoveCommand` aux MJ (`MapExplorer.as:266-269`) — mais le
survol muet.

Le survol est branché. `worldmap/subarea-index.ts` indexe `maps.json` en
`(x, y) -> carte -> sous-zone`, et le renderer écrit `Région : <aire>` et le nom
de sous-zone dans la barre, teinte la silhouette de la sous-zone et affiche les
coordonnées en infobulle. Comme en 1.29, le calcul n'a lieu qu'au changement de
case et la teinte est sautée au zoom minimal.

Deux cartes partagent souvent une case — 557 des 4 880 d'Amakna, une ville et
ses égouts. L'index écarte d'abord les sous-zones `souterrain`, puis garde la
plus étendue : la carte du monde nomme la surface.

À noter : aucun clic n'aboutissait de toute façon, pour la raison décrite en
QA-166.
