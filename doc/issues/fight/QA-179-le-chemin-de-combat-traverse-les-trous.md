---
id: QA-179
title: En combat, l'aperçu du déplacement passe par les trous de la carte
severity: P2
domain: fight
type: bug
status: fixed
session: 1
opened: 2026-11-04
closed:
fixed_in:
related: [QA-087]
files:
  - packages/grid/src/walkability.ts
  - packages/grid/src/pathfinding.ts
  - apps/electrobun/src/game/network/handlers/map.handler.ts
  - apps/electrobun/src/game/game-client.ts
  - apps/gameserver-ts/src/core/features/game/move-ack/move-ack.handler.ts
---

## Symptôme

Carte 7417, combat. Au survol d'une case, le chemin orange passe sur un
trou : la case est teintée par-dessus le trou. Le clic part au serveur,
`client.log` à 08:56:37 : `fight-move 184 → 197 (3 steps)`. Le chemin
envoyé est `[184, 198, 212, 197]`. Aucun `walk start` ne suit, le personnage
ne bouge pas.

Les cellules 211, 212 et 213 sont les trois trous alignés, toutes avec
`movement = 1` (calques 1528, 1529 et 1532). La 264 est dans le même cas.

## Attendu (1.29)

Un combattant n'entre jamais sur une cellule `movement = 1` :

- `InteractionsManager.as:69` la refuse comme destination dès que
  `bIsFight` ;
- `Pathfinding.as:157` ne l'ouvre que si elle est la case d'arrivée ;
- une case inactive est fermée dans tous les modes.

Le chemin contourne donc le trou. Une case trou ne reçoit ni chemin, ni
teinte de portée.

## Cause

Le serveur construit la carte de combat d'un PvM avec `active && movement > 1`
(`move-ack.handler.ts`), donc il refusait ce chemin. Le client, lui,
construisait son unique pathfinder avec `walkable`, soit `movement !== 0`
(`map.handler.ts`, `buildPathfinding`). `findFightPath` et
`reachable(…, true)` traversaient ainsi les trous que le serveur refuse.

## Correctif

La règle est maintenant écrite à un seul endroit : `isFightWalkable` dans
`@dofus/grid`. Le serveur (PvM) et le client (`map.handler.ts`,
`spellTargetError` dans `game-client.ts`) l'utilisent tous les deux.

`DofusPathfinding` prend un second ensemble, celui des cases praticables en
combat. Sans cet argument, il retombe sur le premier, ce qui laisse l'IA des
monstres inchangée puisqu'elle passe déjà l'ensemble de combat. Cet ensemble
alimente `findFightPath`, pour l'aperçu et le clic, et
`reachable(…, true)`, pour la teinte de portée. Le pathfinding hors combat
ne change pas : la moitié exploration de QA-087 reste ouverte.

Rejoué sur les données de la 7417, 184 → 197 donne désormais
`[184, 198, 183, 197]`, toujours 3 PM.

Hors périmètre, à traiter à part : un défi (`startChallenge`) crée sa carte
de combat sans ensemble praticable ni cases bloquant la vue. Côté serveur,
tout y est donc praticable et transparent.

## Vérification

- `cd packages/grid && bun test src/` : un chemin de combat contourne un
  trou, un trou n'est jamais une destination, et il est absent de
  `reachable`.
- `cd apps/electrobun && bun test src/hud/fight/hover-preview.spec.ts` :
  l'aperçu ne traverse ni ne cible un trou.
- `bun run build` dans `packages/grid` : les apps importent `dist/`.
- À rejouer en jeu, sur la 7417 : survoler une case derrière la rangée de
  trous. Le chemin contourne, aucune case trou n'est teintée, et le clic
  déplace le personnage.
