---
id: QA-162
title: Le panneau Métiers affiche seize fois « Couper », sans nom de ressource ni tri
severity: P3
domain: hud-panels
type: bug
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-134, QA-131]
files:
  - apps/electrobun/src/hud/jobs
  - apps/electrobun/src/game/lang/jobs-lang.ts
  - apps/electrobun/src/hud/banner/BannerReact.tsx:517
---

## Symptôme

Panneau Métiers, personnage Bûcheron. Relevé du texte rendu :

```
Bûcheron / niveau 3
Couper niveau 1 · Couper niveau 30 · Couper niveau 50 · Couper niveau 70
Couper niveau 90 · Couper niveau 40 · Couper niveau 80 · Couper niveau 10
Couper niveau 20 · Couper niveau 60 · Scier 2 cases · Couper niveau 35
Couper niveau 35 · Couper niveau 50 · Couper niveau 80 · Couper niveau 100
Couper niveau 75 · Options d'artisan…
```

Deux défauts distincts :

1. les seize compétences de récolte portent le même libellé, « Couper » — rien
   ne distingue le Frêne du Bambou Sacré ;
2. l'ordre est celui de la trame, pas celui des niveaux : 1, 30, 50, 70, 90,
   40, 80, 10, 20, 60, puis la compétence d'artisanat au milieu, puis 35, 35,
   50, 80, 100, 75.

Accessoirement, le bouton d'ouverture n'est pas dans la bannière mais dans le
panneau de débordement, derrière le « + » (`BannerReact.tsx:517`), là où le
runbook S04 §3 parle d'un « bouton de bannière ».

## Attendu (1.29)

La liste nomme la ressource, pas le verbe, et se lit dans l'ordre des niveaux
requis. C'est ce qui permet à un joueur de savoir ce qu'il peut couper.

## Cause

Le libellé vient du bundle `SK`, où l'entrée est bien « Couper » pour les seize
compétences. Le nom utile est celui de `job_skills.harvest_item_id` — déjà en
base, déjà résolu ailleurs puisque le menu contextuel d'un arbre affiche
« Frêne ».

## Correctif

Afficher `« Couper » (Frêne)`, ou la ressource seule, en résolvant
`harvest_item_id` comme le fait le menu d'objet interactif ; trier par
`minLevel` croissant, compétences d'artisanat regroupées à part.

## Vérification

Panneau Métiers d'un Bûcheron : seize lignes distinctes, du Frêne (1) au
Bambou Sacré (100), dans l'ordre.

## Résolution

`JobsPanel` résout `SK[id].i` contre la table d'objets de `crafts-lang` — le
même chemin que le menu de l'objet interactif — et affiche
`« Couper » — Bois de Frêne`. `orderSkills` trie les compétences de récolte par
`minLevel` croissant et regroupe les compétences d'artisanat à part : leur
`minLevel` n'est pas comparable, puisqu'elles s'ouvrent au nombre de cases.

Relevé manette en main, Bûcheron niveau 30 : seize lignes distinctes, du **Bois
de Frêne (1)** au **Bois de Bambou Sacré (100)**, dans l'ordre, « Scier » en fin
de liste avec ses 4 cases.

**Le bouton n'a pas bougé** : il est toujours dans le panneau de débordement,
derrière le « + ». C'était une remarque accessoire de la fiche, pas son
correctif, et déplacer un bouton de bannière est une décision de mise en page
qui ne se prend pas au passage.
