---
id: QA-182
title: Un visuel qui lit cellTo se dessine au double de sa position, loin de la case visée
severity: P1
domain: fight
type: bug
status: fixed
session: 1
opened: 2026-11-04
closed:
fixed_in:
related: [QA-181, QA-183]
files:
  - packages/spell-runtime/src/clip/harness.ts:84
  - apps/electrobun/src/game/scene/fight/spell-view.ts:249
  - apps/electrobun/src/game/spells/spell-512.ts:387
  - packages/spell-runtime/src/clip/harness.spec.ts
  - apps/electrobun/scripts/audit-spell-display-types.ts
---

## Symptôme

Horloge (sort 95, visuel 512), lancée sur la case adjacente au Xélor, apparaît à
plusieurs dizaines de cases, vers le milieu ou le bord droit de la carte. Le
décalage change d'un lancer à l'autre, avec la position de la cible. Deux
captures du 2026-11-04 : le lanceur est en haut à gauche, le cadran à
~1000 px à droite.

## Attendu (1.29)

Le cadran se dessine au-dessus de la case visée.

## Cause

`configureHarness` (`harness.ts:84-85`) expose `root.vars.cellTo` et `cellFrom`
en coordonnées **monde**. `spell-view.ts:249` place déjà le conteneur sur l'ancre
(la cible pour 11, le lanceur pour 10). Les modules traduisent `_X =
_parent.cellTo.x` mot pour mot (`spell-512.ts:387-392`) : le clip se retrouve à
ancre + monde, soit au double de la cible.

En retail, `mc.cellTo` n'est posé que pour 50/51 (`VisualEffectHandler.as:224`),
où `mc` est à l'origine. Les coordonnées y sont donc celles de l'espace du
conteneur. Pour Horloge, le canon est 51 et le module déclarait 11 (QA-181).

Modules qui affectent `cellTo`/`cellFrom` en absolu sous un ancrage non nul :
309, 505, 512, 1109, 2002, 2004, 2005, 2022, 2060, 2912.

## Correctif

`root.vars.cellFrom/cellTo` sont désormais exprimés dans l'espace du conteneur
(monde − ancre). Rien ne change sous 50/51, où l'ancre vaut (0,0). Sous 10/11,
la traduction littérale de l'AS tombe juste.

Reproduit avant correctif, avec une sonde sur Horloge sous 11, lanceur en
(200,200) et cible en (440,260) : `sprite_42` se posait en **(880,520)**, le
double de la cible. Après correctif : (440,260), sous 11 comme sous 51.

Mesure de l'audit `audit-spell-display-types.ts`, comparé au harness de HEAD :
huit visuels réparés (309, 505, 512, 1013, 2002, 2004, 2005, 2060) et une seule
régression, 2102, qui soustrayait `ctx.cellTo` à la main et lit maintenant
`cellTo` littéralement. 513 et 509, qui forçaient 0, lisent aussi `cellTo`.

## Vérification

`cd packages/spell-runtime && bun test` : `cellTo` vaut (0,0) sous 11, et un
placement littéral sur `cellTo` tombe sur la cible sous 10, 11, 50 et 51.
L'audit ne signale aucun écart de translation pour les visuels Xélor. En jeu,
Horloge se dessine sur sa case.
