---
id: QA-166
title: "Carte du monde : aucune entrée ne l'atteint, et 1 à 2 s pour l'ouvrir"
severity: P1
domain: worldmap
type: bug
status: fixed
session: 6
opened: 2026-09-07
closed:
fixed_in:
related: [QA-009, QA-028, QA-029, QA-030, QA-031, QA-032, QA-033]
files:
  - apps/electrobun/src/hud/worldmap/WorldMapPanel.tsx
  - apps/electrobun/src/game/worldmap/world-map-renderer.ts
  - apps/electrobun/src/game/worldmap/world-map-data.ts
  - apps/electrobun/src/game/worldmap/minimap-renderer.ts
  - scripts/worldmap-optimize.ts
---

## Symptôme

Deux défauts distincts sur le même écran.

**Rien n'est interactif.** Glisser ne déplace pas la carte, la molette ne zoome
pas, survoler un hint n'affiche pas son infobulle, cliquer ne fait rien — alors
que la barre d'aide annonce « Glisser Déplacer | Molette Zoom ».

**L'ouverture prend une à deux secondes**, pendant lesquelles la fenêtre est
figée.

## Attendu (1.29)

`MapExplorer` s'ouvre immédiatement et répond au glissé comme à la molette.

## Cause

**Les entrées.** `WorldMapPanel.tsx:90-98` rendait un conteneur plein canevas en
`pointerEvents: "auto"` :

```tsx
<div style={{ position: "absolute", inset: 0, zIndex: 15, pointerEvents: "auto" }}>
```

La racine de `HudOverlay` (`HudOverlay.tsx:88-97`) est en `pointerEvents: "none"`
précisément pour laisser passer vers le canevas. Ce conteneur les réactivait sur
toute la surface : l'`EventSystem` de Pixi, dont le `domElement` est
`app.canvas`, ne recevait plus rien, et le listener `wheel` posé sur ce même
canevas non plus. Une seule ligne, et tout l'écran est mort.

Trois défauts secondaires étaient masqués derrière :

- `setupDragControl` écoutait `pointermove` sur `root` au lieu de
  `globalpointermove` — un glissé rapide sortant du conteneur perd ses
  événements ;
- `setupZoomControl` ancrait le zoom sur `e.clientX/clientY`, coordonnées
  fenêtre, alors que le canevas n'est pas collé au coin de l'écran ;
- `isPointOverUI()` bloquait le glissé sur tout le rectangle du panneau
  « Categories » (QA-032).

**L'ouverture.** `renderMap()` montait les 1024 tuiles d'Amakna en une frame :
1024 `Assets.load` séparés, 1024 `updateMipmaps()`, 1024 fondus `rAF`
concurrents, et jusqu'à 256 Mo d'upload de textures. **754 de ces tuiles n'ont
qu'une seule couleur** — le parchemin autour du continent et le gris des trous —
soit environ 80 % du coût pour deux teintes. La minimap faisait la même chose,
sur sa propre Application Pixi.

Trois défauts de même famille : `hide()` ne détachait ni les sprites ni le
listener molette, qui continuait donc de zoomer une carte invisible pour le
reste de la session ; `centerMap()` et `clampPosition()` bornaient sur la
planche de tuiles (8192²) alors que le monde n'en occupe que 6678 × 5184, ce qui
laissait paner dans le vide ; et `findMapAtCoord` était un balayage linéaire des
9 271 cartes.

## Correctif

**Entrées.** La racine du panneau passe en `pointerEvents: "none"` ; seule la
barre d'outils repasse à `"auto"`. Le glissé écoute `globalpointermove`, `root`
reçoit une `hitArea` explicite pour que `pointerdown` parte même hors tuile, et
le zoom convertit par `getBoundingClientRect()`. Le listener molette est posé
par `show()` et retiré par `hide()`.

**Ouverture.** `just worldmap-optimize` (`scripts/worldmap-optimize.ts`, relit
les `.webp` déjà commités, aucun SWF requis, déterministe) réécrit les
manifestes en trois niveaux :

- `overview.webp`, la planche entière au quart de résolution — une requête de
  124 Ko, peinte dès la première frame et gardée comme LOD de dézoom ;
- `uniform_tiles`, les 754 tuiles unies groupées par couleur, que le renderer
  dessine en rectangles pleins — exact au pixel, zéro requête ;
- `tiles`, les 270 qui restent, chargées selon le viewport.

Amakna passe de 1024 à 270 tuiles demandables, Incarnam de 256 à 55, et le
manifeste de 102 à 50 Ko. Au zoom par défaut une vingtaine de tuiles sont
montées au lieu de 1024. La minimap suit le même chemin.

Au passage : `clampPosition()` borne sur l'étendue réelle du contenu,
`subarea-index.ts` remplace le balayage linéaire par une table, et
`map-data.json` (844 Ko) sort du chargement — `maps.json`, déjà chargé pour le
libellé de position, porte les mêmes 9 271 cartes avec les mêmes coordonnées et
la sous-zone en plus.

## Vérification

- `bun test ./src/game/worldmap/ ./src/game/stores/worldmap-store.spec.ts`
  couvre la sélection des tuiles visibles, le choix du LOD, l'étendue du contenu
  et l'index de sous-zones.
- Deux exécutions de `just worldmap-optimize` produisent des fichiers
  identiques octet pour octet.
- Manette en main : ouvrir avec `M` l'onglet Réseau ouvert — quelques dizaines
  de requêtes de tuiles, pas 1024 ; la carte est peinte immédiatement ; glisser
  la déplace ; la molette zoome sous le curseur.
