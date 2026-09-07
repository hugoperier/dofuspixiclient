---
id: QA-032
title: Le panneau « Categories » masque la carte et n'est ni déplaçable ni repliable
severity: P3
domain: worldmap
type: bug
status: fixed
session: 1
opened: 2026-08-20
closed:
fixed_in:
related: [QA-028, QA-031]
files: []
---

## Symptôme

Il occupe en dur le coin haut-gauche de la zone cartographique.

## Correctif

`createCategoryUI()` est supprimé du renderer. Les filtres sont une rangée de la
barre du haut, en React, comme en 1.29 : la carte reste visible en entier, et il
n'y a plus de panneau flottant à déplacer ou à replier.

Effet de bord réglé au passage : `isPointOverUI()` bloquait le glissé sur tout
le rectangle qu'occupait ce panneau.
