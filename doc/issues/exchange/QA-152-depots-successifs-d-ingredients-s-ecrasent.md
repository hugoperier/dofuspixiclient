---
id: QA-152
title: Les dépôts successifs d'un ingrédient s'écrasent — 820 recettes sont infabricables
severity: P1
domain: exchange
type: bug
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-135, QA-136, QA-137]
files:
  - apps/electrobun/src/hud/craft/CraftWindow.tsx:131
  - apps/gameserver-ts/src/core/modules/exchange/craft.flow.ts:139
  - apps/gameserver-ts/src/core/modules/exchange/craft.flow.ts:381
---

## Symptôme

Scie de Bûcheron, Planche en Frêne (20 Bois de Frêne), sac contenant 21 bois.

- « Tout poser » met les 21 dans la case. « Combiner » ne produit **rien** :
  ni objet, ni message, ni ligne de journal au niveau `LOG`.
- « Poser 10 » met 10 dans la case, et **la pile restante disparaît de la
  bande d'inventaire** de la fenêtre.
- Un second « Poser 10 » part bien sur le fil — la sonde client enregistre
  `["exchangeMoveItem", 250, true, 10]` deux fois — et la case affiche
  toujours **10**.

Le seul moyen d'aboutir a été de ramener le sac à exactement 20 en base, puis
« Tout poser » : « Fabrication réussie », XP +1, ingrédients consommés.

## Portée

```sql
with x as (select r.result_item_id, max((i->>'quantity')::int) as maxq
           from recipes r, jsonb_array_elements(r.ingredients) i group by 1)
select count(*) filter (where maxq>10), count(*) from x;
--  820 | 2296
```

**820 recettes sur 2 296 (36 %)** demandent plus de 10 unités d'un ingrédient.
Elles sont hors d'atteinte dès que le joueur en possède plus que la quantité
requise — c'est-à-dire dans le cas normal d'un récoltant.

## Attendu (1.29)

Les entrées « Poser », « Poser 10 » et « Tout poser » cumulent : trois clics
sur « Poser » mettent trois unités. La pile restante demeure visible et
manipulable tant qu'elle n'est pas vide.

## Cause

Les deux côtés ne parlent pas de la même quantité.

`craft.flow.ts:139` traite `EMO` comme un **total absolu** :

```ts
bench.slots[itemId] = quantity;
```

`CraftWindow.tsx:131` envoie un **incrément** :

```ts
const lay = (item, amount) =>
  gameClient?.exchangeMoveItem(item.unicId, true, Math.min(amount, item.quantity));
// "Poser" → lay(item, 1) · "Poser 10" → lay(item, 10) · "Tout poser" → lay(item, item.quantity)
```

Le second dépôt réécrit donc la case avec 10 au lieu de 20.

S'y ajoute le filtre de la bande d'inventaire, qui retire la pile entière dès
qu'elle est posée en partie :

```ts
const onBench = new Set(craft.slots.keys());
const bag = getBagItems(inventory).filter((item) => !onBench.has(item.unicId));
```

Le joueur ne peut donc même pas retenter.

Le refus qui s'ensuit est silencieux : `matchRecipe` exige l'égalité stricte
(`onBench.get(ingredient.itemId) === ingredient.quantity`) et rend
`no-such-recipe`, que personne ne transmet au client — voir QA-159.

## Correctif

Deux gestes dans `CraftWindow.tsx` :

1. `lay` envoie le nouveau total, pas l'incrément :
   `min(craft.slots.get(item.unicId) ?? 0 + amount, item.quantity)`.
2. La bande d'inventaire garde une pile partiellement posée, avec son
   reliquat, et ne l'exclut qu'à quantité nulle.

## Vérification

Sac de 60 Bois de Frêne, Scie, recette Planche en Frêne :

1. « Poser 10 » deux fois → la case affiche **20**, la bande affiche 40 ;
2. « Objet obtenu » montre la Planche en Frêne ;
3. « Combiner » → « Fabrication réussie », inventaire 40 bois et +1 planche.

Puis une recette à 3 ingrédients : trois clics sur « Poser » donnent 3.

## Résolution

Les deux gestes du correctif, dans `CraftWindow.tsx` :

1. `lay` envoie **le nouveau total** — `laidFrom(unicId) + min(amount, reste)` —
   parce que `EMO` est absolu côté serveur (`bench.slots[itemId] = quantity`) ;
2. la bande d'inventaire garde une pile partiellement posée avec son reliquat et
   ne l'exclut qu'à quantité nulle.

`SecureCraftWindow.tsx` reçoit le même traitement : il ne savait poser qu'une
pile entière, ce qui rendait infabricable, à deux, toute recette demandant moins
que ce que le client porte.

Relevé manette en main, Scie d'Incarnam, 62 Bois de Frêne :

| geste | case | bande |
|---|---|---|
| « Poser 10 » | 10 | 52 |
| « Poser 10 » | **20** | **42** |

« Objet obtenu » affiche la Planche en Frêne dès le second dépôt, « Combiner »
répond **« Fabrication réussie. »**, la pile passe de 3 à 4 planches et le bois
reste à 42. Puis 10 + 10 + 1 = **21** : le cumul marche aussi à trois clics.

En craft coopératif : le client pose 10 + 10, les deux grilles affichent 20, sa
bande 40 ; l'artisan clique « Créer » ; **l'objet entre chez le client** et
**l'XP va à l'artisan** (S06 §3 vérifié au passage).
