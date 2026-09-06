# Sprint 07 — Les métiers : rendre traversable ce qui est déjà écrit

**Objectif** — reprendre les quatorze défauts que la recette de session 8 a
sortis de S04, S05 et S06, pour qu'un joueur puisse parcourir le chantier
métiers de bout en bout sans passer par la base.

**Pourquoi maintenant** — les trois sprints précédents ont livré le
référentiel, la récolte, l'atelier, l'oubli et la coopération, et leurs vingt
issues sont passées `fixed`. La recette manette en main dit autre chose : la
récolte marche à cinq métiers sur cinq et 48 ressources sur 48, l'atelier
ouvre pour les 33 compétences d'artisanat, l'oubli rend exactement ses pods —
et pourtant **820 recettes sur 2 296 sont infabricables**, le craft coopératif
est bloqué par sa propre boîte de dialogue, et le Paysan n'a rien à faucher à
son palier 40. Le chantier est fini au sens du code et infranchissable au sens
du joueur.

**Pourquoi la recette d'abord** — ce sprint est un sprint de reprise : sa
valeur tient entièrement à ce que son runbook soit exécutable. Or il ne l'est
pas aujourd'hui. §9 de S04 demande de « relever les pods maximum » là où
l'écran n'affiche aucun nombre ; la seule carte qui porte les 48 ressources
n'a pas de sol et le panneau admin ne sait pas y aller ; les six totaux de §1
ne correspondent plus à l'import. Trois demi-journées rendent les onze autres
fiches recettables — et évitent de refaire à la main ce que la session 8 a dû
faire par requêtes SQL.

**Fini quand** — le runbook en fin de document passe intégralement.

---

## Hors périmètre — explicitement

- **La forgemagie.** Toujours. Les 15 compétences `f` sont importées, leurs
  ateliers magiques sont posés, rien ne les lit.
- **Le contrôle de distance générique** (QA-114). QA-153 ferme la récolte, et
  elle seule : le combat, l'échange et l'objet interactif gardent leur trou.
- **La limitation de débit** (QA-064).
- **La boucle du Chasseur en jeu.** QA-157 rend le métier apprenable ; ce que
  ses taux de viande donnent réellement en fin de combat est une recette à
  part, qui ne peut pas être écrite avant que le métier existe.
- **Le décrafting et le broyage.**
- **Le remplacement de la carte 8335.** QA-164 demande qu'on puisse s'y rendre
  et y cliquer ; fabriquer une vraie carte de recette entretenue est un autre
  chantier.

---

## Lot A — Rendre la recette exécutable

En premier parce que les trois lots suivants se recettent avec ces outils, et
parce que la session 8 a dû les contourner un par un.

| # | Issue | Ce qui change | Ordre de grandeur |
|---|---|---|---|
| A1 | [QA-163](../issues/hud-panels/QA-163-aucun-affichage-numerique-des-pods.md) | Une infobulle `courant / maximum` sur la barre de pods | ½ jour |
| A2 | [QA-164](../issues/world-content/QA-164-carte-de-reference-des-ressources-impraticable.md) | « Vers une carte » accepte un identifiant brut ; sol praticable sur 8335 | ½ jour |
| A3 | [QA-165](../issues/progression/QA-165-ecarts-de-volumetrie-du-referentiel.md) | Les six totaux de S04 §1 fixés sur le relevé, récapitulatif d'import | ½ jour |
| A4 | [QA-161](../issues/progression/QA-161-runbook-s04-decrit-une-recolte-annulable.md) | S04 §8 branche 1 réécrite contre QA-143 | ¼ jour |

**A3 et A4 sont des corrections de recette, pas de code**, et c'est voulu :
une recette qui déclare un échec là où le code est juste (A4) ou qui donne des
nombres approximatifs comme détecteur de régression (A3) coûte plus cher que
le défaut qu'elle prétend attraper.

## Lot B — L'artisanat, débloqué

| # | Issue | Ce qui change | Ordre de grandeur |
|---|---|---|---|
| B1 | [QA-159](../issues/exchange/QA-159-refus-de-fabrication-silencieux.md) | `CRAFT_DENIAL_MESSAGES`, envoyées sur `Im` | ½ jour |
| B2 | [QA-152](../issues/exchange/QA-152-depots-successifs-d-ingredients-s-ecrasent.md) | `EMO` envoie un total, la pile partielle reste en bande | 1 jour |
| B3 | [QA-155](../issues/exchange/QA-155-boites-de-confirmation-du-craft-cooperatif-jamais-fermees.md) | La demande se démonte sur `EC` | 1–2 jours |

**B1 avant B2, délibérément.** Le défaut de B2 a coûté une demi-heure à
diagnostiquer en session parce que « Combiner » ne produit littéralement rien
— pas un message, pas une ligne de journal. Livré en premier, B1 aurait nommé
`no-such-recipe` en une seconde. C'est la même règle que QA-123 pose pour la
récolte, et l'artisanat est le seul flux du chantier à ne pas la tenir.

**B2 est une ligne et demie** dans `CraftWindow.tsx`, et débloque 36 % du
livre de recettes. C'est le meilleur rapport du sprint.

**B3 est le seul dont la cause n'est pas établie.** Le serveur fait son
travail — `SecureCraftFlow: 1 works for 9 (skill 101)`, deux `EC` émis — donc
le chantier est côté client, dans le cycle de vie de la boîte de demande.

## Lot C — Le référentiel, complet

| # | Issue | Ce qui change | Ordre de grandeur |
|---|---|---|---|
| C1 | [QA-154](../issues/progression/QA-154-lin-et-chanvre-du-paysan-inaccessibles.md) | Une cellule récoltable porte plusieurs compétences | 2–3 jours |
| C2 | [QA-158](../issues/world-content/QA-158-contremaitre-ikul-n-enseigne-rien.md) | `ACTION_LEARN_JOB` devient dominant, ou le type 234 est implémenté | ½ jour |
| C3 | [QA-157](../issues/world-content/QA-157-chasseur-et-bricoleur-inapprenables.md) | Les branches de dialogue manquantes | 1 jour |

**C1 porte une décision de conception, à trancher avant d'écrire la
migration** : deux métiers partagent-ils une occurrence l'un après l'autre, ou
la première récolte la consomme-t-elle pour les deux ? Le 1.29 dit la seconde,
et c'est ce que la clé primaire actuelle sait déjà exprimer — ce qui doit
changer est la colonne `skill_id`, pas la clé. Une fiche qui commence par
changer la clé primaire aura fait le contraire de QA-132.

**C2 avant C3** : le même mécanisme de grisage explique les deux, et C2 est le
cas simple, à un seul effet parasite.

## Lot D — Le serveur dit la vérité

| # | Issue | Ce qui change | Ordre de grandeur |
|---|---|---|---|
| D1 | [QA-160](../issues/progression/QA-160-pods-non-rafraichis-a-l-apprentissage.md) | `sendStats` à la fin de `JobsService.learn` | ¼ jour |
| D2 | [QA-153](../issues/progression/QA-153-recolte-sans-controle-de-proximite.md) | L'adjacence testée dans `HarvestService.start` | 1 jour |
| D3 | [QA-156](../issues/server-runtime/QA-156-redemarrage-de-gamed-deconnecte-les-clients.md) | Le handoff survit à un redémarrage en mode watch | 2–3 jours |

**D2 utilise l'adjacence de `packages/grid/src/area.ts`, pas `±1`.** C'est le
piège que CLAUDE.md signale : les identifiants consécutifs sont sur la même
rangée visuelle et à deux pas l'un de l'autre.

**D3 en dernier, et c'est le seul lot qui peut déborder.** Sa cause n'est pas
établie ; `bun --watch` tue et relance le même processus, ce qui ne laisse
peut-être aucune fenêtre où l'ancien cœur puisse remettre son état au nouveau.
S'il faut changer la façon dont `scripts/dev.sh` relance les cœurs, la fiche
le dira avant qu'on y touche.

---

## Runbook

À exécuter à la main, dans l'ordre, par quelqu'un qui n'a pas écrit le code.

### Préparation

```bash
git lfs pull && bun install
just wasm && just db
just import-world game.sql
SPAWN_MAP_ID=7365 just db-seed
bash scripts/dev.sh
```

Se connecter (`dev` / `dev`), choisir le personnage.

---

### 1 · Le référentiel fait ses comptes — A3

```bash
just import-jobs game.sql
just import-jobs game.sql          # une seconde fois, exprès
```

**Attendu** — les deux passages impriment le même récapitulatif, et il
correspond **ligne à ligne** aux nombres écrits dans S04 §1. Plus de « ~ ».

**Échec si** — un seul écart, dans un sens ou dans l'autre. C'est tout
l'intérêt de A3 : ce relevé redevient un détecteur de régression d'import.

---

### 2 · Les pods se lisent — A1, D1

**Gestes** — ouvrir l'inventaire, survoler la barre de pods.

**Attendu** — deux nombres, `courant / maximum`.

**Gestes** — apprendre un métier chez un maître, survoler à nouveau, **sans
changer de carte**.

**Attendu** — le maximum a monté de **5**. Boire la potion d'oubli du même
métier : il redescend de 5.

**Échec si** — le maximum ne bouge qu'au prochain changement de carte. C'est
exactement le symptôme que QA-133 avait fermé pour le passage de niveau et que
l'apprentissage n'avait jamais eu.

---

### 3 · La carte de référence sert — A2

**Gestes** — panneau admin (Ctrl+Shift+A) → « Vers une carte » → saisir
`8335` → téléporter.

**Attendu** — le bouton s'active malgré l'absence de coordonnées, et la
téléportation aboutit.

**Gestes** — sur place, hache équipée, cliquer le Frêne puis « Couper ».

**Attendu** — le personnage **marche** jusqu'à la cellule et récolte. C'est la
partie qui manquait : en session 8 il a fallu émettre `GA;500` à la main pour
parcourir les 48 ressources.

---

### 4 · Un refus de fabrication se lit — B1

**Gestes** — devant une Scie, poser une quantité qui ne correspond à aucune
recette (21 Bois de Frêne, par exemple), cliquer « Combiner ».

**Attendu** — un message, « Aucune recette ne correspond à ces ingrédients. »

**Échec si** — il ne se passe rien du tout. C'est l'état actuel, et c'est ce
que QA-123 interdit depuis le début du chantier.

Refaire avec l'atelier fermé entre-temps : le motif diffère.

---

### 5 · Les 820 recettes reviennent — B2

**Gestes** — 60 Bois de Frêne en sac, Scie, recette Planche en Frêne (20).
Clic droit sur la pile → « Poser 10 », puis **une seconde fois**.

**Attendu** — la case affiche **20**, la bande d'inventaire affiche encore la
pile avec ses **40** restants, et « Objet obtenu » montre la Planche en Frêne.
« Combiner » → « Fabrication réussie ».

**Échec si** — la case reste à 10, ou la pile disparaît de la bande après le
premier dépôt.

**Le cas qui vérifie l'autre bout** — une recette à 3 ingrédients : trois clics
sur « Poser » donnent 3, pas 1.

---

### 6 · Le craft coopératif se joue — B3

**Préparation** — deux clients, l'artisan devant un atelier de son métier.

**Gestes** — l'artisan clique le second joueur, « Inviter à *métier* » ; le
client accepte.

**Attendu** — **les deux boîtes disparaissent** et les deux fenêtres sont
utilisables. Le client dépose ses ingrédients, l'artisan clique « Créer ».

**Attendu** — l'objet entre chez le **client**, l'expérience va à l'**artisan**.

**Échec si** — une modale reste affichée par-dessus la fenêtre. C'est l'état
actuel : le serveur ouvre bien la session, personne ne peut s'en servir.

**Gestes** — recommencer et répondre « Non ».

**Attendu** — les deux boîtes disparaissent aussi, aucune session ne survit.

---

### 7 · Le Paysan a son palier 40 — C1

```bash
docker exec dofuspixiclient-postgres-1 psql -U dofus -d dofus -tAc \
  "select s.id, count(*) from job_gatherable_cells g
     join job_gatherable_cell_skills k
       on k.map_id = g.map_id and k.cell_id = g.cell_id
     join job_skills s on s.id = k.skill_id
    where s.id in (50, 54) group by 1;"
```

**Attendu** — 836 pour la compétence 50 (Lin), 644 pour la 54 (Chanvre).

**Gestes** — un Paysan niveau 50, faux équipée, sur une carte à lin : faucher
du Lin, puis du Chanvre.

**Gestes** — sur la même occurrence, avec un Alchimiste : cueillir la Fleur de
Lin.

**Attendu** — la décision écrite dans QA-154 est celle qu'on observe : la
première récolte consomme l'occurrence pour les deux métiers.

---

### 8 · Les maîtres enseignent — C2, C3

**Gestes** — Contremaître Ikul, Incarnam [3,3] : « Je cherche à apprendre un
métier » → « Le métier de bûcheron m'intéresse. » → la confirmation.

**Attendu** — la réponse de confirmation est **noire et cliquable**, et le
métier est appris. Refaire pour ses trois autres offres.

**Gestes** — aller chez le maître Chasseur, puis chez le maître Bricoleur.

**Attendu** — les deux métiers s'apprennent.

```sql
select distinct split_part(args, ',', 1)::int from npc_dialog_response_actions
 where type = 6 order by 1;
```

**Attendu** — 41 et 65 dans la liste.

---

### 9 · On ne récolte plus de loin — D2

**Gestes** — depuis la console du client, sans se déplacer :

```js
gameClient.sendInteractiveUse(<cellule éloignée>, <compétence>)
```

**Attendu** — un refus lisible, « Vous êtes trop loin de cette ressource. »,
et `gatherable_cell_states` inchangée.

**Échec si** — la récolte se joue. C'est ce que fait le dépôt aujourd'hui, et
c'est un bot de récolte instantané en trois lignes.

**Puis le parcours normal** — cliquer l'arbre, laisser l'approche se faire,
récolter : il doit continuer de passer, y compris depuis l'autre bout de la
carte.

---

### 10 · Le redémarrage ne coupe plus — D3

**Gestes** — client connecté, personnage en jeu :

```bash
touch apps/gameserver-ts/src/core/modules/harvest/harvest.service.ts
```

**Attendu** — **aucune boîte de déconnexion**, le personnage reste sur sa
carte, et les trames émises pendant la coupure sont rejouées.

**Gestes** — refaire le geste **pendant** une récolte.

**Attendu** — elle se termine ou se libère ; aucune réservation ne survit.

```bash
docker exec dofuspixiclient-postgres-1 psql -U dofus -d dofus -tAc \
  "select count(*) from gatherable_cell_states where reserved_until > now();"
```

**Attendu** — 0.

**Ce qui doit continuer de passer** — les échéances persistées survivent déjà :
le journal doit toujours imprimer `armed N resource respawns` avec le N exact
de la base.

---

### 11 · Le panneau se lit — A1, et le reste

**Gestes** — ouvrir le panneau Métiers d'un Bûcheron.

**Attendu** — seize lignes **distinctes**, nommant leur ressource, **triées par
niveau** du Frêne (1) au Bambou Sacré (100), les compétences d'artisanat
regroupées à part.

> Couvre [QA-162](../issues/hud-panels/QA-162-panneau-metiers-competences-indiscernables.md), qui n'est dans aucun lot : c'est la seule fiche du
> sprint qui n'empêche rien et se corrige en même temps que A1, dans le même
> fichier.

---

### 12 · Non-régression avant clôture

1. Les runbooks de S04, S05 et S06 en entier — c'est ce sprint qui les rend
   exécutables, il doit les faire passer.
2. Les 48 ressources des cinq métiers de récolte, une par une, sur 8335.
3. Un atelier ouvert pour chacun des cinq métiers présents à Incarnam.
4. Banque, échange entre joueurs, hôtel de vente : les trois autres types
   d'échange passent par le socle que B2 et B3 touchent.

```bash
cd apps/gameserver-ts && bun test src/ && bun run test:integration && bun run typecheck
cd ../electrobun     && bun test ./src && bun run check-types
cd ../..             && just issues-check
bun run --cwd packages/proto gen && git diff --exit-code packages/proto/gen
```

**Le sprint est clos** quand cette liste passe et que les onze étapes
précédentes sont vertes.

## À faire à la clôture

Passer QA-152 à QA-165 en `fixed`, renseigner leur `fixed_in`, puis
`just issues`. Elles ne passent `closed` qu'après avoir été rejouées manette
en main — c'est ce que ce runbook permet de franchir.

**`@dofus/proto` ne bouge pas.** Les refus de fabrication de B1 empruntent
`Im` / `InfoMessage`, que la récolte utilise déjà ; aucun message n'est
inventé. Le seul changement de contrat est une **migration** : la table de
jointure de C1.

Le chantier métiers est alors traversable de bout en bout par un joueur, à
l'exception de la forgemagie, qui n'a jamais été dans son périmètre, et de la
recette des taux du Chasseur, qui devient écrivable pour la première fois.

---

## Ce que la recette a donné

Les quatorze fiches sont `fixed` et les étapes 1 à 11 du runbook sont passées
manette en main, dans Chrome, sur le client réel. Ce qui suit est ce que la
recette a appris **contre** ce que ce sprint annonçait — c'est la partie qui
mérite d'être lue avant la prochaine passe.

**Quatre corrections au sprint lui-même.**

1. **QA-164 se trompait de moitié.** 8335 n'a pas de décor au sol, mais ses
   479 cellules sont **toutes marchables**, et `findAdjacentPath` atteint les
   48 ressources. Ce qui bloquait la session 8 était l'autre moitié — ne pas
   pouvoir s'y téléporter — et le contournement (`GA;500` depuis une position
   fixe) est précisément ce que D2 interdit maintenant. Le sol de 8335 n'a pas
   été touché : il n'en avait pas besoin.

2. **QA-160 se trompait de point d'appel.** « La dépendance existe déjà dans le
   module » est faux : `StatsModule` importe `JobsModule`, donc `JobsService`
   ne peut pas appeler `sendStats`. L'appel est dans la tranche
   `npc-dialog`, qui est le seul chemin d'apprentissage qui ne l'avait pas.

3. **B1 avait une seconde moitié que personne n'avait vue.** `Im` arrivait bien
   au client et n'était affiché **nulle part** : `appendInfoMessage` n'écrivait
   que dans `chatStore.infos`, lu par le seul `SideChatPanel`, qu'aucun écran
   ne monte. Les onze refus rédigés de la récolte (QA-123) étaient muets pour
   la même raison depuis le début du chantier. Le journal principal les affiche
   désormais, et « Vous êtes trop loin de cette ressource. » est apparu à
   l'écran pour la première fois **en même temps** que le refus de fabrication.

4. **D3 demandait une part de plus.** Le bleu/vert marchait ; personne ne le
   déclenchait, parce qu'il exige deux processus et que `bun --watch` en relance
   un seul. `scripts/dev-core.ts` fait la bascule à chaque modification. Mais
   rendre le redémarrage invisible **a créé un défaut qui n'existait pas** :
   une récolte en cours mourait avec l'ancien cœur, jauge au bout, sans
   récompense, sur une ressource verrouillée une minute. `HarvestService`
   devient la onzième part du handoff. Le commentaire qui l'en excluait avait
   raison **tant que** le redémarrage raccrochait le client ; la même phrase est
   devenue fausse le jour où elle a cessé de l'être.

**Ce qui reste à faire avant de clore.** Le §12 n'est passé qu'en partie :
les suites automatiques (714 tests serveur, 74 d'intégration, 276 client,
`typecheck`, `issues-check`, `@dofus/proto` immobile) et les onze étapes. **Ne
sont pas rejoués** : les runbooks de S04, S05 et S06 en entier, les 48
ressources une par une, les cinq ateliers, et les trois autres types d'échange
(banque, échange entre joueurs, hôtel de vente). Les fiches restent donc
`fixed` et non `closed`, ce qui est exactement ce que cette distinction dit.
