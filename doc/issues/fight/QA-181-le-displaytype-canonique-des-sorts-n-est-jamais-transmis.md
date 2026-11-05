---
id: QA-181
title: Les visuels de sort ignorent leur displayType canonique et s'ancrent au hasard du module
severity: P2
domain: fight
type: bug
status: fixed
session: 1
opened: 2026-11-04
closed:
fixed_in:
related: [QA-168, QA-182]
files:
  - assets/sources/starloco/sorts.sql
  - apps/gameserver-ts/src/core/modules/fight/engine/fight.actions.service.ts:317
  - proto/game.proto:593
  - apps/electrobun/src/game/scene/fight/spell-view.ts:198
  - packages/spell-runtime/src/clip/runtime-spell.ts:88
  - tools/combat-exporter/generate-spells.ts:599
  - apps/gameserver-ts/migrations/0068_spell_sprite_infos.ts
  - apps/electrobun/src/game/scene/fight/display-type.ts
  - apps/electrobun/scripts/audit-spell-display-types.ts
---

## Symptôme

En combat, une partie des visuels ne part pas du bon endroit. Les invocations
(visuel 1100) s'affichent sur la case visée au lieu du lanceur. Les flèches et
les épées lancées (`displayType` 21) ne volent pas et se jouent comme un impact
sur la cible. Horloge (sort 95) s'affiche loin de sa case (voir QA-182).

Comparaison relevée entre `sorts.spriteInfos` et le `displayType` déclaré par
chaque `apps/electrobun/src/game/spells/spell-<gfx>.ts` :

| Mesure | Valeur |
| --- | --- |
| Sorts avec un visuel et un displayType ≥ 10 | 216 |
| Sorts dont le module diverge du canon | 209 |
| … dont sorts de classe (`class_spells`) | 119 |
| Écart 10 (lanceur) → 11 (cible) | 77 |
| Écart 51 → 50 | 41 |
| Écart 51 → 11 | 26 |
| Écart 21 (projectile) → 11 | 24 |

Plusieurs gfx servent sous des displayTypes différents selon le sort : 503
(10 et 11), 1100 (10, 11 et 31), 1208 (11 et 51), etc.

## Attendu (1.29)

`GameActionsEx.as:409-434` (`case 300`) lit le displayType dans le paquet :
`spellId,cellId,gfx,level,displayType,anim,front`. Le serveur l'envoie sort par
sort depuis `sorts.spriteInfos` (`"51,1,1"` pour Horloge, `"51,0,1"` pour Frappe
de Xélor). `VisualEffectHandler.onLoadInit` choisit l'ancrage selon cette valeur.
Le SWF du visuel ne la contient pas.

## Cause

Le serveur n'importe pas `spriteInfos` et n'envoie ni displayType ni animation du
lanceur. `fight.actions.service.ts:317` envoie toujours `animation: "anim1"`.
Côté client, `spell-view.ts:198` donne la priorité au `displayType` figé dans le
module. Ces modules sont générés par LLM (`generate-spells.ts:599`) à partir des
seuls scripts AS, avec la consigne « TargetCell par défaut si incertain ».

## Correctif

- Migration `0068_spell_sprite_infos` : `spell_templates.display_type`,
  `cast_animation`, `sprite_in_front`, importés de `sorts.sql` (1676 modèles
  remplis). `SpellsRepository.findLevel` les joint à chaque rang.
- `ActionSpellLaunch.display_type` (champ 10). Le serveur remplit aussi
  `animation` (`anim<n>`, d'où `anim0` pour Frappe de Xélor) et
  `front_of_sprite` à partir des mêmes données.
- Client : `effectiveDisplayType` (`scene/fight/display-type.ts`) fait
  prévaloir la valeur du serveur sur celle du module, sauf pour les couples
  (gfx, displayType) que l'audit trouve cassés sous le canon. Ceux-là gardent
  la valeur du module, c'est-à-dire le comportement d'avant. `RuntimeSpell`
  configure son harness avec `context.displayType`, si bien que l'ancre et le
  harness concordent toujours.
- Audit `apps/electrobun/scripts/audit-spell-display-types.ts`, branché sur
  `just spells-coverage` : chaque visuel est joué, sans GPU, sous chacun de
  ses displayTypes canoniques et sous celui de son module. Trois contrôles :
  invariance par translation (le lancer rejoué décalé de (1000, 600) doit se
  décaler d'autant, ce qui détecte QA-182 sans seuil), symboles du harness
  (`move`/`shoot`/`duplicate`), cycle de vie. L'audit régénère
  `display-type-fallbacks.json` et suit un cliquet,
  `doc/combat/display-type-baseline.json`.
- Le générateur (`generate-spells.ts`) reçoit le displayType canonique du
  visuel au lieu de le deviner.
- Modules Xélor réécrits pour leur canon : 501 Gelure (41 : le harness sème
  `duplicate` puis attache `shoot`), 509 Sablier, 512 Horloge, 513 Frappe,
  515 Momification (51).

## Généralisation à toutes les classes

Le premier passage ne réglait que les modules Xélor : 32 couples (gfx,
displayType) restaient en repli. Le second les reprend tous, classe par classe,
en se guidant sur l'audit.

**Ancrage monde (canon 51)**. Le module, écrit pour 11, forçait `x = 0` là où
l'AS dit `_X = _parent.cellTo.x`. Sont désormais traduits littéralement :
Enutrof 311 (Clé Réductrice), Sram 412 (Attaque Mortelle), Écaflip 615 (Griffe
de Ceangal), Sadida 1010 (Ronces Agressives), 1012 (Herbe Folle) et 1014
(Oeil de Taupe / Larme, aussi Crâ), Pandawa 1207 (Épouvante), ainsi que les
monstres 2006, 2008 et 2057. Dans 1012, le brin d'herbe exporté à part suit son
parent jusqu'à la cible.

**Projectiles**. Deux écarts du harness avec `VisualEffectHandler.as` :

- 20/21 : `shoot` s'attache désormais au delta de la cible, **non tourné**
  (contre-rotation dans la racine tournée). Sous 20/21, `cellFrom`/`cellTo`
  passent dans le repère tourné ; `angle` reste l'angle monde, comme `mc.angle`
  en 1.29.
- 30/31 : l'arc se calcule même sans symbole `move` et atterrit (`shoot`
  plus impact), comme le fait 1.29. Sans ce correctif, Désinvocation (1100)
  n'atterrissait jamais.

Garde ajoutée au faisceau 40/41 : un lanceur posé sur sa cible donnait `0/0`,
et le faisceau ne finissait jamais.

L'audit ne réclame plus un `shoot` absent du SWF : en 1.29, `attachMovie` ne
fait alors rien. Il vérifie en revanche que le `shoot` du harness atterrit bien
sur la cible. C'est ce contrôle qui a trouvé Enutrof 306 (Lancer de Pièces),
Iop 809 (Épée du Jugement, Colère de Iop) et Crâ 906 (Flèche Absorbante) : leur
module attachait son propre `shoot` sur le lanceur. Crâ 910 (Flèche Explosive)
est réécrit pour son canon 31. Les visuels en 20/21 sans `shoot` jouent
désormais leur timeline depuis le lanceur, tournée vers la cible : Sram 403/405
(Peur, Sournoiserie, Poison Insidieux), Iop/Crâ 804/806 (Intimidation, Souffle,
Pression, Épée Divine…), Crâ 903 (Flèche Cinglante), Xélor 510 (Aiguille). Les
composites sont bien dessinés depuis l'origine, en direction +x (vérifié au
rendu pour 903, 804 et 405).

Bilan de l'audit : **32 couples en repli → 9**. Sorts de classe restants : un
seul, Sram 406 (Arnaque, Persécution). Son SWF a un vrai `shoot` et un
`sprite22` qui se tourne lui-même, que le module généré a confondus ; le
reconstruire demande le SWF. Les 8 autres couples sont des sorts de monstres,
dont 6 sont cassés même sous la valeur de leur propre module (ils ne finissent
jamais), sans lien avec l'ancrage : 1202, 1208, 2021, 2050, 2051, 2060, 2067,
2068.

## Reste à faire

- Sram 406 : à reconstruire à partir du SWF.
- Les visuels de monstres qui ne finissent pas leur cycle de vie (voir
  `doc/combat/display-type-audit.json`).
- `cast_animation` : les codes `-1` (aucun visuel) et `-2` (visuel sans pose)
  ne sont pas modélisés. Un seul sort à visuel est concerné ; il garde `anim1`.

## Vérification

- `bun run test:integration` (gameserver) : 95 et 91 donnent 51, 82 donne 10.
- `cd packages/spell-runtime && bun test` : un module déclaré en 11 reçoit le
  `move` du harness quand le contexte dit 30.
- `bun test src/game/scene/fight/display-type.spec.ts` (client).
- `bunx just spells-coverage` passe le cliquet.
- En jeu : Contre (82) se joue sur le lanceur, Gelure (84) trace sa traînée
  du Xélor jusqu'à la cible.
