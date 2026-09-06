---
id: QA-163
title: Les pods n'ont aucune valeur chiffrée — la recette QA-133 n'est pas exécutable à la main
severity: P3
domain: hud-panels
type: gap
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-133, QA-160]
files:
  - apps/electrobun/src/hud/inventory
---

## Symptôme

Fenêtre d'inventaire, zone « Pods » : une barre de 122 px avec un remplissage
de 29 px, sans infobulle et sans texte. Relevé DOM du parent : `"26 161\nPods"`
— le nombre appartient aux kamas, pas aux pods.

Le serveur envoie pourtant les deux valeurs, sur `Ow` :
`{ currentWeight: 272, maxWeight: 1130 }`.

## Conséquence

L'étape S04 §9 dit « relever les pods maximum dans la bannière, monter d'un
niveau de métier, les relever » et attend « exactement 5 pods de plus par
niveau ». Un écart de 5 sur 1 130 déplace le remplissage de 0,13 px : **la
recette telle qu'elle est écrite ne peut pas être exécutée à la main.**

La règle elle-même est juste — vérifiée par lecture de la trame : oubli d'un
métier niveau 3 → `maxWeight` 1 145 → 1 130.

## Attendu (1.29)

Le survol de la barre affiche `courant / maximum`.

## Correctif

Une infobulle `272 / 1130` sur la barre, alimentée par la dernière `Ow`.

## Vérification

Survoler la barre : les deux nombres s'affichent. Apprendre un métier :
le maximum monte de 5 à l'écran, sans changer de carte (voir QA-160).

## Résolution

`EquipmentPanel` écrit `courant / maximum` à gauche de la jauge et le répète en
infobulle (`EQUIP_FOOTER.podsText`). Relevé manette en main : **`417 / 1430`**,
puis **`1435`** immédiatement après un apprentissage — les cinq pods de QA-133
se lisent enfin à l'œil nu, ce que 0,13 px de remplissage ne permettait pas.

S04 §9 est réécrit en conséquence : il demande d'ouvrir l'inventaire et de lire
le nombre, et dit explicitement de ne pas juger la jauge à l'œil.
