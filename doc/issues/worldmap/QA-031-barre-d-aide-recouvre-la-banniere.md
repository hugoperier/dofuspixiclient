---
id: QA-031
title: La barre d'aide recouvre la bannière
severity: P3
domain: worldmap
type: bug
status: fixed
session: 1
opened: 2026-08-20
closed:
fixed_in:
related: [QA-032]
files: []
---

## Symptôme

« M Fermer | Glisser Déplacer | Molette Zoom » est posée en bas au centre,
par-dessus le cœur de vie et la boussole.

## Correctif

La barre d'aide bas-centre est supprimée. Ses trois indications vivent
maintenant dans les infobulles des boutons de la barre du haut, qui n'empiète
sur rien : « Fermer (M) » sur la croix, « Déplacer la carte » sur l'outil,
« Zoomer » / « Dézoomer » sur les boutons de zoom.
