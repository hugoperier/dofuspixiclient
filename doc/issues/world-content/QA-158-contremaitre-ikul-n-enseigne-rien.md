---
id: QA-158
title: Contremaître Ikul grise ses quatre offres de métier — un effet non implémenté les accompagne
severity: P2
domain: world-content
type: data
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-130, QA-142, QA-097]
files:
  - apps/gameserver-ts/src/core/modules/npcs/npc-dialog.service.ts:209
  - apps/gameserver-ts/src/core/modules/npcs/npc-dialog.service.ts:76
  - apps/electrobun/src/game/network/handlers/npc-dialog.handler.ts:120
---

## Symptôme

Contremaître Ikul, Incarnam [3,3] (carte 10302), est le premier maître de
métier que rencontre un personnage. Son dialogue s'ouvre, propose « Je cherche
à apprendre un métier », puis les quatre métiers de la ferme — bûcheron,
paysan, pêcheur, alchimiste.

La réponse finale de chacun, « Nous sommes d'accord. Je commence ma carrière
de bûcheron. », est **grisée et inerte** : `button.disabled === true`, aucune
trame n'est émise au clic, `player_jobs` reste vide.

Les quatre offres sont touchées :

```sql
select l.response_id, j.name, string_agg(a.type::text, ',' order by a.type)
  from (select distinct response_id, split_part(args,',',1)::int as job_id
          from npc_dialog_response_actions where type=6) l
  join jobs j on j.id = l.job_id
  join npc_dialog_response_actions a on a.response_id = l.response_id
 where l.response_id in (3189, 3190, 3191, 3192) group by 1, 2;
-- 3189 | Bûcheron   | 1,6,234
-- 3190 | Paysan     | 1,6,234
-- 3191 | Pêcheur    | 1,6,234
-- 3192 | Alchimiste | 1,6,234
```

Le même parcours chez **Oli Venders** [2,-21] passe sans encombre : « Es-tu sûr
de vouloir devenir bûcheron ? » → « Oui » → `JS` avec les seize compétences.

## Portée

Chacun des 19 métiers enseignés garde au moins une réponse jouable ; aucun
n'est perdu. Ce qui est perdu est le **maître de départ** : un joueur qui suit
le tutoriel d'Incarnam trouve quatre offres mortes avant d'en trouver une
vivante à Astrub.

## Cause

`classify()` (`npc-dialog.service.ts:209`) grise toute réponse portant un effet
qu'il ne sait pas exécuter :

```ts
if (effects.some((effect) => !IMPLEMENTED_EFFECTS.has(effect.type))) {
  return { kind: "blocked" };
}
```

`IMPLEMENTED_EFFECTS` ne contient que `ACTION_OPEN_BANK` et
`ACTION_LEARN_JOB`. Les quatre réponses d'Ikul portent aussi un **type 234**
(`args` `8539;10302`), qui remet vraisemblablement l'outil du métier.

La règle est la bonne — « a wrong dialog is worse than a greyed one » — mais
elle sacrifie ici l'effet principal pour un effet accessoire.

## Correctif

Deux options :

1. implémenter le type 234 (remise d'objet), ce qui débloque aussi tout ce qui
   le porte ailleurs ;
2. ou faire de `ACTION_LEARN_JOB` un effet **dominant**, comme
   `ACTION_OPEN_BANK` l'est déjà : quand il est présent, la réponse est jouée
   et les effets non implémentés qui l'accompagnent sont journalisés, pas
   bloquants.

L'option 2 est cohérente avec le commentaire qui précède `classify()` :
l'ouverture de la banque gagne déjà contre la navigation qui l'accompagne.

## Vérification

Manette en main, à Incarnam [3,3] : Contremaître Ikul → « Je cherche à
apprendre un métier » → « Le métier de bûcheron m'intéresse. » → la réponse de
confirmation est **noire et cliquable**, et `player_jobs` reçoit la ligne.

Puis `bun test src/core/modules/npcs/` : un cas couvre une réponse portant
`[1, 6, 234]` et attend `kind: "learn-job"`.

## Résolution

Option 2, et **seulement pour l'apprentissage**. `ACTION_LEARN_JOB` devient le
seul effet dominant : quand il est là, la réponse est jouée et les effets non
implémentés qui l'accompagnent sont abandonnés. La banque **reste** sous la
règle générale — elle gagne contre la *navigation* qui la suit, ce qui n'est pas
la même chose, et le cas « ouvrir la banque + démarrer une quête » doit rester
grisé. Le prix est compté plutôt que caché : `doLoad` journalise combien de
réponses sont jouées avec un effet abandonné.

`npc-dialog.service.spec.ts` couvre `[1, 6, 234]` → `kind: "learn-job"`, et le
cas banque + effet inconnu reste `blocked`.

Manette en main, Incarnam [3,3] : « Je cherche à apprendre un métier » →
« Dites moi comment devenir paysan. » → **« Je retrousse mes manches et on y
va ! » est noire et cliquable**. Avec un Bûcheron niveau 1, elle emprunte la
branche d'échec (« Il va te falloir d'abord finir la formation… ») ; à niveau
30, elle aboutit et `player_jobs` reçoit le Paysan, puis le Pêcheur.
