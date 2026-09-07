---
id: QA-028
title: Titre « Categories » en anglais dans un panneau français
severity: P3
domain: worldmap
type: bug
status: fixed
session: 1
opened: 2026-08-20
closed:
fixed_in:
related: [QA-016, QA-023]
files: []
---

## Symptôme

Les entrées sous l'en-tête sont bien traduites (« Lieux de classes », « Hôtels
de vente », « Ateliers », « Divers », « Territoires de conquête », « Donjons »,
« Grille ») ; seul l'en-tête reste en anglais.

## Correctif

L'en-tête venait de `createCategoryUI()`, un panneau dessiné dans le canevas
Pixi avec son titre en dur. Le panneau est remplacé par
`hud/worldmap/WorldMapToolbar.tsx`, dont la rangée de cases porte le libellé
« Filtres » — la clé `HINTS_FILTER` que lit `MapExplorer.as:172`.
