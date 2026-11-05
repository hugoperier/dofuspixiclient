---
id: QA-174
title: Le corps-à-corps n'existe nulle part — ni slot, ni chemin serveur, ni stats d'arme
severity: P1
domain: fight
type: gap
status: fixed
session: 1
opened: 2026-09-09
closed:
fixed_in:
related: [QA-173, QA-007]
files:
  - proto/game.proto
  - apps/gameserver-ts/migrations/0065_weapon_combat_stats.ts
  - apps/gameserver-ts/scripts/import-starloco-content.ts
  - apps/gameserver-ts/src/core/modules/inventory/weapon-info.ts
  - apps/gameserver-ts/src/core/modules/fight/cast/fight.close-combat.ts
  - apps/gameserver-ts/src/core/modules/fight/cast/fight.cast.ts
  - apps/gameserver-ts/src/core/modules/fight/engine/fight.actions.service.ts
  - apps/gameserver-ts/src/core/modules/spells/spells.service.ts
  - apps/gameserver-ts/src/core/modules/spells/spells.repository.ts
  - apps/gameserver-ts/src/core/modules/spells/spells.frames.service.ts
  - apps/gameserver-ts/src/core/modules/inventory/inventory.service.ts
  - apps/electrobun/src/game/network/handlers/fight.handler.ts
  - apps/electrobun/src/hud/banner/BannerReact.tsx
---

## Symptôme

Le joueur ne peut pas frapper avec son arme. Il n'y a pas de conteneur à gauche
de la grille, pas de touche, et rien à envoyer : `fight-turn.handler.ts:56-61`
ne laisse passer que les actions 1 et 300, `playerSpellRank` répond « ce sort
n'est pas appris » pour le sort 0, et `item_templates` n'a aucune colonne où
loger le coût en PA ou la portée d'une arme. `fireCloseCombat`
(`fight.module-hooks.ts:98`) était défini et jamais appelé, donc les défis qui
comptent les coups d'arme ne pouvaient pas se déclencher.

## Attendu (1.29)

`dofus.datacenter.CloseCombat` construit `Spell(0, 1)` et remplace chacun de
ses getters — `apCost`, `rangeMin/Max`, `criticalHit`, `criticalFailure`,
`lineOnly`, `lineOfSight`, `effectsNormalHit` — par la valeur de l'arme
équipée. Sans arme, il rend le sort 0 tel quel : « Coup de poing », 4 PA,
portée 1. `MouseShortcuts._ctrCC` est son conteneur, hors des 14 cellules et
insensible à l'onglet. Le serveur répond par `GA;303`, pas par `GA;300`.

## Cause

Les statistiques de combat des armes ne sont **ni dans le dump StarLoco, ni
dans une colonne**. Elles vivent uniquement dans le bundle lang, à
`I.u[<id>].e`, et l'export v2 émet ce tableau **à l'envers** — le même
renversement que les tableaux `lN` des sorts, documenté en tête de
`migrations/0039`. La lecture correcte est `retail(i) === e[7 - i]` :

| index `e` | 0    | 1        | 2       | 3        | 4        | 5        | 6      | 7           |
| --------- | ---- | -------- | ------- | -------- | -------- | -------- | ------ | ----------- |
| champ     | LdV  | ligne    | échec   | critique | portéeMax| portéeMin| coût PA| bonus crit. |

Le sort 0 lui-même, en revanche, **était déjà en base** : `migrations/0039` ne
filtre pas l'id 0, donc `spell_levels(0, 1)` existe depuis toujours. Le
corps-à-corps à mains nues ne demandait aucune donnée nouvelle.

## Correctif

- `migrations/0065` ajoute `item_templates.weapon_info` (jsonb) et le sème
  depuis le bundle ; 4363 gabarits en portent un. `import-starloco-content`
  fait le même calcul pour qu'un ré-import ne l'efface pas.
- `weapon-info.ts` isole la lecture du tableau `e`. Sa table d'index est une
  **déduction**, pas de la documentation : `weapon-info.spec.ts` la verrouille
  sur trois armes du bundle (Petite Epée 40, Petit Arc 88, Mauvaise Pioche
  1439), dont la Mauvaise Pioche à 6 PA et 1 échec sur 10.
- `fight.close-combat.ts` bâtit le sort. Il ne prend de l'arme que les effets
  qui **frappent** (91-100, 101, 108, 127) : le reste de la liste est du
  bonus d'équipement, déjà fondu dans les caractéristiques du porteur, et le
  rejouer donnerait « +1 Chance » à qui reçoit le coup. Le masque de cible est
  `AnyFighter` — la ligne du Coup de poing porte 7, pas `Enemy`, et une arme
  peut frapper un allié.
- `CastSpellUseCase.resolve` détourne le sort 0 avant `playerSpellRank` et
  passe le sort déjà construit à `resolveCast` ; toute la validation existante
  (tour, PA, géométrie, ligne de vue) s'applique ensuite sans changement.
- La diffusion émet `GA;303` avec `weapon_template_id` et `animation` — deux
  champs ajoutés au message, parce que le client ne connaît l'équipement
  d'aucun autre combattant et ne peut donc pas deviner la pose — et appelle
  enfin `fireCloseCombat`.
- `buildSpellList` ajoute une `SpellData` de plus, à `position` 0. Cette
  position est hors de la plage 1..42 que la grille adresse : aucune cellule ne
  peut la dessiner, et le client hérite gratuitement du ciblage, de l'anneau de
  portée et de la machine de lancement.
- L'inventaire lève `player.weapon-changed`, `SpellsFramesService` renvoie la
  liste. Un événement plutôt qu'un appel direct : `PlayersModule` importe déjà
  `SpellsModule` et l'inventaire dépend des joueurs, donc l'arête inverse
  fermerait un cycle. Pour la même raison le poids lourd `InventoryRepository`
  n'est pas injecté dans `SpellsService` — `SpellsRepository.findEquippedWeapon`
  lit la seule ligne utile.

## Reste à faire

Deux points connus, aucun bloquant :

- **Pas de visuel d'impact.** `spell-view.ts` charge
  `assets/dofassets/spells/<id>.dofasset` ; le module d'exécution
  `src/game/spells/spell-0.ts` existe (« Generic Impact », displayType 11)
  mais le `.dofasset` correspondant n'est pas publié — seule l'icône
  `spells/icons/0.dofasset` l'est. Le premier coup écrit donc une ligne
  d'erreur dans le chat (`reportedBrokenVisuals` la limite à une), et il ne
  reste que la pose de frappe. Le régénérer demande les SWF retail, que le
  dépôt n'embarque pas.
- **Ni bonus de portée d'arme, ni boost de PA d'arme**
  (`SpellsBoostsManager.ACTION_BOOST_ITEM_AP_COST`) : le coup lit les
  statistiques brutes de l'arme.

## Vérification

```bash
cd apps/gameserver-ts
bun test src/core/modules/inventory/weapon-info.spec.ts \
         src/core/modules/fight/cast/fight.close-combat.spec.ts \
         src/core/modules/fight/cast/fight.cast.spec.ts
bun run test:integration        # migration 0065 sur un vrai postgres
just db-migrate && just import-world game.sql
```

Relevé attendu en base :

```sql
select weapon_info from item_templates where id = 88;
-- {"apCost": 4, "rangeMin": 2, "rangeMax": 6, "criticalRate": 30, ...}
select ap_cost, range_min, range_max from spell_levels where spell_id = 0;
-- 4 | 1 | 1
```

À la main, dans le client lancé (`just dev`), en combat :

1. Le conteneur à gauche de la grille montre l'icône de l'arme équipée.
2. `²` ou `0` le sélectionne ; la case adjacente s'allume.
3. Frapper : les PA de l'arme sont retirés, les dégâts de l'arme sont infligés,
   la pose de l'arme est jouée.
4. Déséquiper l'arme : le conteneur montre le poing, le coût retombe à 4 PA et
   la portée à 1, **sans relancer le combat** — la liste de sorts est renvoyée
   au changement d'arme.
5. Sur un coup critique, les dégâts sortent de la plage haute de l'arme et non
   de son seul plancher : `rollEffect` borne le jet de dés à `[min, max]`, donc
   la formule est décalée en même temps que les bornes.
6. La pose jouée est celle de la frappe, pas celle d'un sort : le serveur
   annonce `anim0`, la seule valeur que 1.29 envoie pour un coup d'arme.
