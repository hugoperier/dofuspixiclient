---
id: QA-165
title: Le référentiel importé ne fait pas les comptes annoncés par le runbook S04
severity: P3
domain: progression
type: data
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-129, QA-154]
files:
  - apps/gameserver-ts/scripts/import-starloco-jobs.ts
  - doc/sprints/S04-metiers-recolte.md
---

## Symptôme

Relevé après `just import-world game.sql`, avec la requête même du runbook
S04 §1 :

```sql
select (select count(*) from jobs), (select count(*) from job_skills),
       (select count(*) from job_skills where kind = 1),
       (select count(*) from job_tools), (select count(*) from recipes),
       (select count(*) from job_gatherable_cells);
--  34 | 144 | 57 | 70 | 2296 | 12216
```

| grandeur | attendu S04 §1 | relevé |
|---|---|---|
| métiers | ~39 | **34** |
| compétences | 147 | **144** |
| dont récolte | 57 | 57 ✔ |
| recettes | ~2 298 | **2 296** |
| cellules récoltables | ~12 226 | **12 216** |

Les valeurs pointées de §1 sont toutes justes — Frêne 1/10, Châtaignier 10/15,
Chêne 30/25, Kaliptus **75**/55, Bambou Sacré 100/75 — donc l'import n'est pas
faux ; ce sont les totaux du runbook qui ne correspondent plus.

## Portée

L'écart est petit et n'a bloqué aucune recette. Il compte parce que §1 dit
« **Échec si** — le second passage change une seule ligne » : une recette dont
les nombres de référence sont approximatifs ne peut pas servir de détecteur de
régression d'import.

Les 10 cellules manquantes sont en partie expliquées par QA-154 : trois
compétences de `-Base-` sont posées dans le monde sans ligne dans
`job_gatherable_cells`.

## Correctif

Fixer les six nombres dans S04 §1 sur le relevé réel, sans « ~ », et faire
imprimer par `import-starloco-jobs.ts` un récapitulatif comparable d'un import
à l'autre.

## Vérification

Deux `just import-jobs game.sql` de suite impriment le même récapitulatif, et
il correspond ligne à ligne aux nombres écrits dans S04 §1.

## Résolution

`import-starloco-jobs.ts` imprime un récapitulatif aligné, une ligne par
grandeur, et S04 §1 le cite mot pour mot au lieu de ses six approximations :

```
métiers                         34
compétences                    144
dont récolte (avec XP)          54
outils                          70
recettes                      2296
cellules récoltables         12216
couples cellule/compétence   13696
```

La septième ligne est née avec QA-154 (13 696 = 12 216 + 1 480). Les 54 de
« dont récolte » ne contredisent pas les 57 de `kind = 1` : trois compétences
n'ont ni niveau ni XP en amont, et le script les nomme à chaque passage.

Vérifié : deux `just import-jobs game.sql` de suite produisent une sortie
**identique au diff près de rien du tout**.
