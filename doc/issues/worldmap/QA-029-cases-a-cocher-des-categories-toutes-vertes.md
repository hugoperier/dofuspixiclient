---
id: QA-029
title: Cases à cocher des catégories toutes vertes
severity: P3
domain: worldmap
type: bug
status: fixed
session: 1
opened: 2026-08-20
closed:
fixed_in:
related: [QA-028]
files: []
---

## Symptôme

Chaque ligne porte une case verte identique à gauche et la pastille de couleur
réelle de la catégorie à droite.

## Attendu

La case devrait reprendre la couleur de la catégorie qu'elle pilote.

## Correctif

La barre réutilise `SideChatPanelFilter`
(`components/ui/side-chat-panel.tsx:131-175`), qui pose la couleur passée en
`style` inline. Chaque case prend donc la teinte de sa catégorie, prise dans
`hints-data.json`, et la grille reprend le jaune que `MapExplorer.as:188` lui
donne.
