---
id: QA-154
title: Le Lin et le Chanvre du Paysan n'existent sur aucune cellule du monde
severity: P1
domain: progression
type: data
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-129, QA-123, QA-084]
files:
  - apps/gameserver-ts/migrations/0011_progression.ts
  - apps/gameserver-ts/scripts/import-starloco-jobs.ts
  - apps/gameserver-ts/src/core/modules/harvest/harvest.service.ts:186
---

## Symptôme

```sql
select s.id, j.name, it.name as res, s.min_level, count(g.*) as cellules
  from job_skills s join jobs j on j.id=s.job_id
  left join item_templates it on it.id=s.harvest_item_id
  left join job_gatherable_cells g on g.skill_id=s.id
 where s.kind=1 and j.name='Paysan' group by 1,2,3,4;
```

| compétence | ressource | niveau | cellules |
|---|---|---|---|
| 50 | Lin | 40 | **0** |
| 54 | Chanvre | 50 | **0** |

Le Paysan n'a **rien à récolter à son palier 40**. Vérifié en jeu sur la carte
de référence 8335, qui contient une occurrence de chaque ressource du monde :
elle porte 7 cellules Paysan sur les 9 compétences du métier, et les deux
manquantes sont exactement celles-là.

Trois compétences de `-Base-` sont dans le même cas : « Ramasser » (Pomme de
Terre), « Jouer » et « Pêcher KoinKoin » sont posées dans le monde — 3, 4 et 0
placements respectivement — et absentes de la table, donc refusées en
`no-resource-here`.

## Cause

`job_gatherable_cells` a pour clé primaire `(map_id, cell_id)` : **une cellule
ne peut porter qu'une seule compétence.**

Or 1 480 cellules du monde portent un élément dont le gabarit offre *deux*
compétences de récolte, et dans les deux cas l'Alchimiste l'emporte :

| cellules | conflit |
|---|---|
| 836 | Alchimiste 68 (Fleur de Lin) **+** Paysan 50 (Lin) |
| 644 | Alchimiste 69 (Fleur de Chanvre) **+** Paysan 54 (Chanvre) |

`HarvestService.start` compare ensuite la ligne unique au `skillId` demandé :

```ts
if (!gatherable || gatherable.skillId !== skillId) {
  return this.refuse(sessionId, characterId, "no-resource-here");
}
```

La compétence perdante est donc refusée partout, définitivement.

## Attendu (1.29)

Un plant de lin se cueille par l'Alchimiste (la fleur) **et** se fauche par le
Paysan (la tige). Les deux métiers partagent l'occurrence ; c'est la même
plante et un seul état de disponibilité.

## Correctif

La clé primaire doit rester `(map_id, cell_id)` — c'est elle qui rend l'état
d'une occurrence unique, ce qui est le cœur de QA-132. Ce qui doit changer est
la colonne `skill_id`, qui devient une **liste** de compétences acceptées pour
la cellule (ou une table de jointure `job_gatherable_cell_skills`).
`HarvestService` teste alors l'appartenance, et l'objet rendu suit la
compétence demandée, pas la ligne.

Reste à trancher, et à écrire dans la fiche avant de coder : deux métiers
peuvent-ils récolter la même occurrence l'un après l'autre, ou la première
récolte la consomme-t-elle pour les deux ? Le 1.29 dit la seconde.

## Vérification

```sql
select s.id, count(*) from job_gatherable_cells g
  join job_gatherable_cell_skills k on k.map_id=g.map_id and k.cell_id=g.cell_id
  join job_skills s on s.id=k.skill_id where s.id in (50,54) group by 1;
```

Attendu : 836 pour la compétence 50, 644 pour la 54. Puis, manette en main,
un Paysan niveau 40 fauche du Lin, et un Alchimiste cueille la Fleur de Lin
sur une autre occurrence.

## Résolution

**La décision, écrite avant la migration** : deux métiers partagent une
occurrence, et **la première récolte la consomme pour les deux**. C'est la
lecture 1.29, et c'est celle que la clé primaire `(map_id, cell_id)` exprime
déjà — elle ne bouge donc pas, ce qui laisse QA-132 intact.

Migration `0061_gatherable_cell_skills` : la table de jointure
`job_gatherable_cell_skills (map_id, cell_id, skill_id)` porte les compétences
acceptées ; `job_gatherable_cells` garde l'occurrence et son délai, et perd
`skill_id` et `resource_item_id` — une occurrence qui sert deux métiers n'a ni
« la » compétence ni « la » ressource, et l'objet rendu suit déjà la compétence
demandée. L'import prend **toutes** les compétences que le gabarit annonce, plus
seulement la première ; `JobsRepository.findGatherable` reçoit la compétence
demandée et teste l'appartenance.

Relevé après `just import-jobs game.sql` :

```
50 | 836      -- Lin (Paysan)
54 | 644      -- Chanvre (Paysan)
```

soit exactement les nombres attendus, et 13 696 couples cellule/compétence pour
12 216 cellules — les 1 480 conflits.

Manette en main, sur 8335 avec un Paysan 50 et sa faux : **Lin fauché** sur la
cellule 162 (3 unités, +30 XP), **Chanvre fauché** sur la 163. Sur la même
occurrence 162, la Fleur de Lin de l'Alchimiste répond désormais « Vous ne
connaissez pas le métier nécessaire » — la ligne existe, c'est le métier qui
manque — et `gatherable_cell_states` ne porte qu'**une** ligne pour la 162,
toujours en repousse : l'occurrence est bien consommée pour les deux.
