---
id: QA-180
title: En combat, toutes les armes frappent avec la pose du coup de poing
severity: P2
domain: fight
type: bug
status: fixed
session: 1
opened: 2026-11-04
closed:
fixed_in:
related: [QA-174]
files:
  - apps/gameserver-ts/migrations/0067_item_animation_nullable.ts
  - apps/gameserver-ts/scripts/import-starloco-content.ts
  - apps/gameserver-ts/src/core/modules/fight/cast/fight.close-combat.ts
  - apps/gameserver-ts/src/core/modules/fight/engine/fight.actions.service.ts
  - apps/gameserver-ts/src/core/modules/spells/spells.service.ts
  - apps/gameserver-ts/src/core/modules/spells/spells.repository.ts
  - apps/electrobun/src/game/network/handlers/fight.handler.ts
  - apps/electrobun/src/game/game-client.ts
  - apps/electrobun/src/game/scene/player/animation.ts
  - apps/electrobun/src/game/scene/player/renderer.ts
---

## Symptôme

En combat, un coup d'arme ne joue pas l'animation de l'arme : épée, arc ou
marteau, le personnage donne le coup de poing. Le premier coup du combat
écrit en plus `L'animation du sort 0 n'a pas pu être affichée.` dans le chat.
`client.log` : `Spell visual 0 failed: Error: Visuel 0 vide après conversion
(anim1).`

## Attendu (1.29)

`GameActionsEx` (`case 303`) passe `oSprite.ToolAnimation` à
`spriteLaunchVisualEffect` comme animation du lanceur.
`PlayableCharacter.ToolAnimation` vaut `"anim" + an`, où `an` est le champ
du bundle `items.json` pour l'arme tenue : `anim14` pour une épée, `anim10`
pour un arc, `anim15` pour un marteau. Sans `an`, la valeur est `anim0` en
combat et `anim3` hors combat. Les 24 sprites de classe portent tous
`anim10` à `anim18`.

## Cause

- Le serveur envoyait `anim0` en dur dans `GA;303`. Le commentaire en place
  affirmait que `an` ne servait qu'à tenir l'arme en marchant, ce que le code
  retail contredit.
- Le client associait `anim0` à `ATTACK` et toute autre valeur à `CAST`. Il
  n'avait aucun moyen de jouer un clip `animN` arbitraire.
- `0059` stockait `an ?? 3`. Les 17 armes sans `an` (Petite Epée Sacrée,
  La Klebik, les Dagues Fourbesques…) auraient pris la pose de récolte au
  lieu de `anim0`.
- Pour un coup d'arme, le client demandait le visuel 0. Le retail ne fournit
  pas de `clips/spells/0.swf`, et le `0.dofasset` publié est vide.

## Correctif

- `closeCombatAnimation` reprend la règle de `ToolAnimation`.
  `CloseCombatAttack.animation` la transporte, et `GA;303` l'émet.
- `0067` rend `item_templates.animation_id` nullable et le met à NULL quand
  le bundle ne donne pas de `an`. Le défaut est appliqué à la lecture :
  `anim3` pour la récolte (`?? 3`, inchangé), `anim0` pour un coup d'arme.
  L'import écrit `an ?? null`.
- Côté client, `casterPose` traduit le clip reçu : `anim1` donne `CAST`, tout
  autre clip donne `ATTACK` joué sur ce clip. `setAnimation` accepte une
  option `sprite`, conservée dans `ActivePlayer.spriteAnimation`. Un
  changement d'orientation pendant le coup rejoue donc le même clip.
  `setTimedLoopAnimation` en profite : un outil de récolte garde sa pose
  quand le personnage pivote.
- Le visuel 0 n'est plus demandé pour un coup d'arme. Sans visuel, la porte
  des dégâts s'ouvre à l'`applyEnd` de la pose.

## Vérification

```bash
cd apps/gameserver-ts
bun test src/core/modules/fight/cast/
bun run test:integration           # 0067 sur un postgres neuf
cd ../electrobun
bun test src/game/scene/player/animation.spec.ts \
         src/game/network/handlers/fight-close-combat.spec.ts
```

```sql
select id, name, animation_id from item_templates
where id in (40, 88, 352, 489);
-- 40 Petite Epée de Boisaille 14 · 88 Petit Arc 10 · 352 Petite Epée Sacrée NULL · 489 Loupe 3
```

Test manuel, en combat, avec l'arme équipée :

1. Une épée joue `anim14` et un marteau `anim15`. Le coup de poing n'est
   plus utilisé.
2. À mains nues, le personnage donne le coup de poing (`anim0`).
3. Aucune ligne `L'animation du sort 0…` n'apparaît dans le chat.
