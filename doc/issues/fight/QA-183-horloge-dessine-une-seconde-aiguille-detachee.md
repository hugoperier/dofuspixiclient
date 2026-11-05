---
id: QA-183
title: Horloge et 46 autres visuels redessinent un symbole déjà incrusté dans leur composite
severity: P3
domain: fight
type: bug
status: fixed
session: 1
opened: 2026-11-04
closed:
fixed_in:
related: [QA-182]
files:
  - apps/electrobun/src/game/spells/spell-512.ts:425
  - tools/combat-exporter/output/spell-anims/512/sprite_42_40.svg
  - apps/electrobun/scripts/audit-spell-display-types.ts
---

## Symptôme

Pendant Horloge, une aiguille lumineuse isolée se dessine environ 230 px sous le
cadran, en plus de l'aiguille du cadran lui-même.

## Attendu (1.29)

Une seule aiguille, au centre du cadran. Elle oscille, poussée par le
`onClipEvent(enterFrame)` de `DefineSprite_42/frame_7/PlaceObject2_10_9`.

## Cause

`sprite_10` (l'aiguille) n'a pas été retiré du composite `sprite_42`. Le rendu de
`sprite_42_40.svg` montre l'aiguille en place. Le module l'attache pourtant une
seconde fois sous le nom `wobble_sprite`, à l'origine de `sprite_42`, sans la
matrice de placement du SWF (`spell-512.ts:425`). Celle-ci n'a pas été exportée.

## Correctif

Le module n'attache plus `wobble_sprite` ni `shake_sprite`. Il reste une
dégradation : l'aiguille est figée dans le composite au lieu d'osciller. Pour la
rendre mobile, il faudrait ré-exporter le visuel 512 en dynamique (SWF retail
requis, voir `dynamic-spells.json`).

## Vérification

En jeu, une seule aiguille, au centre du cadran.

## Généralisation

Le défaut n'est pas propre à Horloge. Le générateur attache à part des
`sprite_N` qui sont déjà incrustés dans le composite de leur parent. Un
`sprite_N` n'a pas de nom de liaison : aucun `attachMovie` ne peut le demander,
le module a donc inventé ce placement. Exemples vérifiés au rendu : le cadran de
Contre (504) déjà présent dans `anim1`, la flèche verticale de Flèche Cinglante
(903) qui double la flèche couchée du composite, les ronces de 1010 contenues
dans le bouquet `sprite_15`.

L'audit `audit-spell-display-types.ts` les détecte (`doubleDrawn`) quand trois
conditions sont réunies :

- un `sprite_N` d'au moins 3 chemins est dessiné à l'exécution ;
- tous ses chemins figurent dans les SVG d'un autre composite également
  dessiné ;
- les deux sont à l'écran ensemble pendant au moins 90 % des images du
  `sprite_N`.

Il en trouvait **47 visuels**. Chacun garde le clip et ses scripts (sons,
impact, fin), mais `frames: []` :

- Féca : 104, 109, 112 ;
- Osamodas : 202, 205, 213 ;
- Enutrof : 301, 311, 313, 314 ;
- Xélor : 504 (Contre, Démotivation), 507 (Poussière Temporelle, Vol du
  Temps), 511 (Dévouement) ;
- Écaflip : 601, 602, 603, 604, 613, 614, 615, 616 ;
- Eniripsa : 708, 711, 803 ;
- Iop : 801, 805 (Rayon Obscur, aussi Xélor), 808 ;
- Crâ : 903, 904, 907, 911, 1054 ;
- Sadida : 1013 ;
- Pandawa : 1211, 1212 ;
- monstres : 302, 2001, 2006, 2012, 2013, 2045, 2049, 2054, 2065, 2066, 2108
  et 2200 (ce dernier sortait ainsi aussi du repli de QA-181).

Après le correctif, le détecteur trouve 0 visuel ; le cliquet
`doubleDrawnGraphics` vaut 0. Aucun cycle de vie n'a régressé
(`animation-audit-all.json` : 16 échecs, contre 17 à HEAD).

