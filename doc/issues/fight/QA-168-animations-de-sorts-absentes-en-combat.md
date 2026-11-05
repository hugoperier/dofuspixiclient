---
id: QA-168
title: L'animation de beaucoup de sorts n'est pas affichée en combat
severity: P1
domain: fight
type: bug
status: fixed
session: 4
opened: 2026-09-08
closed:
fixed_in:
related: []
files:
  - apps/gameserver-ts/migrations/0064_fix_stale_visual_gfx_id.ts
  - apps/gameserver-ts/src/core/modules/spells/spells.service.ts
  - apps/electrobun/src/game/assets/spell-asset-loader.ts
  - apps/electrobun/src/game/game-client.ts
  - apps/electrobun/scripts/audit-spell-animations.ts
  - tools/combat-exporter/src/DynamicSpriteAnalyzer.php
  - tools/combat-exporter/src/Command/ExtractSpellAnimsCommand.php
---

## Symptôme

En combat, `L’animation du sort <id> n’a pas pu être affichée.` apparaît dans le
chat pour un grand nombre de sorts. Relevés dans `/tmp/dofus-logs/client.log*` :

```
Spell visual 109 failed: Visuel 109 : symbole lib_sprite14 absent du fichier compilé.
Spell visual 1100 failed: Visuel 1100 vide après conversion (anim1).
```

Le catalogue n'est pourtant pas lacunaire : 284 `.dofasset` publiés et 283 modules
générés couvrent les 205 graphiques que le jeu référence réellement. Un seul
graphique du client retail n'a pas de module (810, qui passe par `PreRenderedSpell`).

## Cause

Quatre défauts distincts, mesurés :

1. **`visual_gfx_id` périmé.** `0040` remplit `visual_gfx_id := spell_id` comme
   valeur d'attente ; `0041_visual_gfx_id_from_starloco.ts:57` fait
   `if (parsed.sprite < 0) continue;` — la ligne est *sautée* au lieu d'être mise à
   `NULL`, malgré son docblock qui affirme le contraire. Les sorts absents du dump
   ne sont jamais visités. `spells.service.ts:75` ne rattrapait que le `NULL`
   (`?? row.spellId`). Relevé en base : **1393 graphiques distincts demandés pour
   284 disponibles — 1159 pointaient vers un fichier inexistant, sur 6941 rangs.**
2. **Tables d'animation vides.** 128 `.dofasset` publiés portaient une FrameTable à
   0 image (`readAnimations` : `Invalid frame 0 in <symbole>`), donc ne dessinaient
   rien — c'est la variante `vide après conversion`. Ils avaient été publiés depuis
   des atlas périmés ; les SVG sources, eux, sont versionnés.
3. **Collision de nommage.** L'exporteur écrit les sprites animés en
   `sprite_<charId>` (`ExtractSpellAnimsCommand.php:374`) et les sprites à
   CLIPACTIONRECORD en `lib_sprite<charId>` (`:838`) ; les modules générés
   demandent toujours la forme `lib_`. 111 références sur 82 sorts.
4. **Symboles jamais exportés.** `DynamicSpriteAnalyzer` ne marquait « dynamique »
   qu'un sprite portant un `PlaceObject2` avec `CLIPACTIONRECORD` ; un sprite qui
   n'a que des `DoAction` de frame (`stop()`, `gotoAndPlay()`) — donc qui a besoin
   de sa propre tête de lecture — n'était jamais exporté. Le pipeline dynamique
   était de plus désactivé par défaut et verrouillé pour tout SWF utilisant
   `attachMovie`.

Aggravant : `VelloSpellTextureProvider.getFrames` **jetait** sur un symbole absent,
et l'exception remontait jusqu'à annuler *toute* l'animation. Un sort auquel il
manquait une seule couche de particules n'affichait rien du tout.

## Correctif

- **Dégradation gracieuse** (`spell-asset-loader.ts`) : un symbole absent journalise
  une fois et renvoie `[]` ; un `SpellClip` sans image continue de dérouler ses
  `frameScripts`. Le message de chat est dédupliqué par graphique, et le chemin
  glyphe/piège (`game-client.ts`) ne laisse plus filer de rejet dans la file de
  présentation.
- **Migration 0064** : `visual_gfx_id` réaligné sur `sorts.sprite`, `NULL` quand le
  sprite est `<= 0` ou le sort absent du dump, en respectant le catalogue de classe
  *par couple (spell_id, level)* — le sort 1688 « Répulsion » n'a que son rang 1 au
  catalogue et prouvait la nécessité. `spells.service.ts` ne retombe plus sur
  `spellId`.
- **127 assets recompilés** depuis les SVG versionnés
  (`tools/combat-exporter/output/spell-anims/`), sans SWF ni FFDec : atlas
  reconstruits, manifestes fusionnés, `.dofasset` recompilés et republiés après
  vérification individuelle (cassé avant / valide après).
- **Alias `lib_sprite<N>` ↔ `sprite_<N>`** résolu dans le loader, partagé par
  `getFrames`, `hasTexture` et `getAnimationInfo`.
- **Exporteur** : prédicat élargi aux `DoAction` de contrôle de lecture,
  `dynamic-spells.json` pour forcer le pipeline dynamique par sort, `FFDEC_PATH`
  surchargeable et échec explicite quand ni FFDec ni ActionScript décompilé ne sont
  disponibles (au lieu d'un `skip` silencieux qui vidait les manifestes).

## Vérification

```sh
bunx just spells-coverage     # ratchet sur doc/combat/spell-symbol-baseline.json
```

État à la clôture de cette passe :

| Mesure | Avant | Après |
| --- | --- | --- |
| Graphiques demandés sans `.dofasset` | 1159 | **0** |
| Rangs concernés | 6941 | **0** |
| Tables d'animation illisibles | 128 | **1** (2928, sans source décompilée) |
| Sorts à symboles absents | 111 | **71** |
| Références résolues par l'alias | — | 111 |

Reste ouvert : les 71 sorts à symboles absents (129 références) relèvent du
ré-export dynamique sort par sort, et exigent une validation visuelle — exporter un
sprite le retire du SVG parent. Deux obstacles identifiés pour cette suite :
`DefineSprite_16` du sort 102 n'existe pas (référence inventée par le générateur),
et les identifiants de caractère divergent entre FFDec et Arakne (le module du sort
102 demande `lib_sprite9`/`lib_sprite14` là où Arakne exporte `sprite4`/`sprite5`),
le même piège que celui déjà noté pour 1005 dans `doc/combat/asset-reconstruction.md`.
