---
id: QA-157
title: Le Chasseur et le Bricoleur ne s'apprennent nulle part
severity: P2
domain: world-content
type: gap
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-130, QA-141, QA-140, QA-142]
files:
  - apps/gameserver-ts/scripts/import-starloco-content.ts
  - apps/gameserver-ts/src/core/modules/inventory/inventory.service.ts:298
---

## Symptôme

Aucun PNJ n'enseigne le Chasseur (41) ni le Bricoleur (65). Le graphe de
dialogue ne porte de branche `type 6` que pour **19 métiers** :

```sql
select split_part(args,',',1)::int as job_id, count(*)
  from npc_dialog_response_actions where type=6 group by 1;
-- 2, 11, 13, 14, 15, 16, 17, 18, 19, 20, 24, 25, 26, 28, 31, 36, 56, 58, 60
```

L'autre voie, la potion d'apprentissage (effet 603), n'existe qu'**une fois**
dans tout le dépôt :

```sql
select t.id, t.name, e->>'id', e->>'param3'
  from item_templates t, jsonb_array_elements(t.effects) e
 where (e->>'id')::int = 603;
--  966 | Manuel du Tailleur | 603 | 1b   (= job 27, Tailleur)
```

Il n'y a donc ni maître ni manuel pour ces deux métiers.

## Portée

- **Chasseur** : tout le lot C de S06 est livré et testé — les 30 paliers de
  viande de `data/hunter-meat-tiers.json` couvrent exactement les 30 viandes
  effectivement lâchées par les monstres, et `fight.end.service.ts` distribue
  le butin — pour un métier qu'aucun joueur ne peut obtenir.
- **Bricoleur** : 157 recettes, atelier posé sur 10 cellules, même situation.
- **Tailleur** : joignable, mais uniquement par un manuel qui tombe d'un seul
  monstre.

## Attendu (1.29)

Les trois métiers ont un maître. Le Chasseur s'apprend à la Taverne du
Chanivore, le Bricoleur au Village des Bricoleurs.

## Correctif

Deux voies, à trancher :

1. **Donnée** — retrouver dans `game.sql` les PNJ maîtres de ces métiers et
   comprendre pourquoi leur branche `type 6` n'a pas survécu à l'import (elle
   n'existe peut-être pas dans le dump 1.39 utilisé).
2. **Contenu** — ajouter les branches manquantes dans une migration de
   contenu, à la manière de QA-142.

## Vérification

```sql
select distinct split_part(args,',',1)::int from npc_dialog_response_actions
 where type=6 order by 1;
```

Attendu : 41 et 65 présents. Puis, manette en main, apprendre le Chasseur chez
son maître, équiper le Couteau de Chasse, gagner un combat contre un monstre à
viande et voir la viande entrer en inventaire avec l'XP de Chasseur.

## Résolution

Voie 1 et voie 2 à la fois, par le greffon que QA-142 a déjà posé pour
l'Alchimiste et le Pêcheur : le bundle 1.29 porte les deux réponses orphelines
— **10220 « Apprendre le métier de Chasseur »** et **10211 « Apprendre le métier
de Bricoleur »** — et `import-starloco-content.ts` les rattache à un PNJ
existant plutôt que d'inventer du texte.

- **Chasseur** → question 3697, le **Chasseur d'Incarnam** (PNJ 882, carte
  10282 [2,1]). Sa question s'ouvrait sur **aucune réponse** : c'est le frère du
  Bûcheron, du Paysan et du Pêcheur d'Incarnam, et le seul des quatre qui
  n'enseignait rien.
- **Bricoleur** → question 978, **Anik Mech** (PNJ 220, carte 4232 [-27,-59]),
  au Quartier des Bricoleurs de Bonta, là où le 1.29 le place. Lui aussi
  s'ouvrait sur une liste vide.

```
select distinct split_part(args,',',1)::int from npc_dialog_response_actions
 where type = 6 order by 1;
-- … 36, 41, 56, 58, 60, 65
```

Manette en main : les deux réponses s'affichent, sont cliquables, et
`player_jobs` reçoit **41** puis **65**.

**Ce qui reste hors périmètre**, comme S07 le dit : les taux de viande du
Chasseur en fin de combat. Le métier est enfin obtenable, donc cette recette
devient écrivable — elle n'est pas écrite.
