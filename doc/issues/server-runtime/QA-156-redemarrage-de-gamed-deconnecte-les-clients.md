---
id: QA-156
title: Un redémarrage de gamed déconnecte les clients, alors que le handoff existe pour l'éviter
severity: P1
domain: server-runtime
type: bug
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-127, QA-121]
files:
  - apps/gameserver-ts/src/core/handoff
  - apps/gameserver-ts/src/gateway/upstream.ts
  - scripts/dev.sh:198
---

## Symptôme

`gamed` tourne en `bun --watch` sous `scripts/dev.sh`. Une modification d'un
fichier serveur le relance. Le client affiche alors, plein écran :

> **Connexion au serveur perdue**
> Le serveur de jeu a redémarré. La session a été fermée et la progression non
> enregistrée est perdue.

Les journaux du redémarrage ne montrent que la découverte des parts, jamais de
restauration :

```
[HandoffCoordinator] discovered 10 handoff parts: sessions, scheduler.jobs,
  player-presence.players, player-presence.pending-moves, exchange.sessions,
  exchange.trades, exchange.crafts, exchange.secure-crafts, bigstore.views,
  chat.flood
```

Aucune ligne `restored …`. Reproduit trois fois de suite (17:21:39, 17:21:51,
17:22:17), à chaque écriture sur un fichier surveillé.

## Attendu

C'est la raison d'être de la découpe, telle que CLAUDE.md la décrit : « le
split existe pour qu'un redémarrage du cœur bufferise les trames du client
quelques centaines de ms et les rejoue — les clients ne voient jamais de
déconnexion. C'est pourquoi les cœurs tournent en mode watch et pas le
gateway. »

Le runbook S04 §10 en fait sa « variante qui sert tous les jours ».

## Portée

Ce qui **survit** est ce qui est persisté : au redémarrage,
`HarvestService.onModuleInit` a ré-armé `armed 35 resource respawns`, soit
exactement les 35 échéances alors en base. Le défaut porte sur la continuité
de **session**, pas sur l'état du monde.

## Cause

`bun --watch` tue et relance le **même** processus sur la **même** socket. Le
bleu/vert demande deux processus vivants au même instant et n'est déclenché que
par `POST /admin/handoff`, que rien n'appelait en dev. Les parts sont découvertes
des deux côtés parce que la découverte est locale au démarrage ; aucun
instantané n'a jamais été demandé.

## Vérification

Client connecté, personnage en jeu :

```bash
touch apps/gameserver-ts/src/core/modules/harvest/harvest.service.ts
```

Attendu : aucune boîte de déconnexion, le personnage reste sur sa carte, les
trames émises pendant la coupure sont rejouées. Puis refaire le geste pendant
une récolte : elle doit se terminer ou se libérer, jamais laisser une
réservation prise.

## Résolution

**La cause est établie, et ce n'était pas un défaut du handoff : personne ne le
déclenchait.** `POST /admin/handoff` est le seul chemin qui prend l'instantané,
et il demande un **second** processus sur une autre socket. `bun --watch` tue et
relance le même processus sur la même socket : le gateway voit son lien actif
mourir et raccroche les sessions **exprès** (`Upstream.invalidateSessions`,
QA-046), parce que le cœur qui revient n'a jamais entendu parler d'elles.
L'invariant annoncé par CLAUDE.md n'était donc vrai que du dispositif, jamais du
`just dev` quotidien.

`scripts/dev-core.ts` remplace `bun --watch` pour les deux cœurs : à chaque
modification il démarre un second cœur sur l'autre socket d'une paire, attend
qu'il accepte une connexion, demande la bascule au gateway, et laisse celui-ci
déplacer l'état et retirer l'ancien. En cas d'échec — pas de jeton, gateway
injoignable, cœur qui ne démarre pas — il le dit et retombe sur l'ancien
comportement plutôt que de laisser un terminal mort.

`HarvestService` devient la onzième part du handoff (`harvest.running`).
Elle en était exclue à dessein, sur l'argument qu'« un redémarrage en cours
d'action perd au plus une récolte, et sa réservation expire toute seule » — vrai
tant qu'un redémarrage raccrochait de toute façon le client. Rendu invisible, il
se voyait autrement : la jauge allait au bout et ne payait rien, sur un arbre que
personne ne pouvait toucher pendant une minute. **Relevé avant le correctif** :
handoff à 2 s d'une récolte de 11 s, aucune récompense, `reserved_until` encore
dans le futur. L'échéance est absolue, donc le nouveau cœur ré-arme ce qu'il
reste ; `onDrain` éteint les minuteurs de l'ancien pour qu'aucune récolte ne soit
payée deux fois.

Relevé manette en main, **deux clients connectés** :

```
[gamed:supervisor] change detected — starting a standby on /tmp/dofus-gamed-b.sock
[HandoffCoordinator] discovered 11 handoff parts: …, harvest.running, chat.flood
[SessionRegistry] restored 2 sessions
[HarvestService] armed 1 resource respawns
[gamed:supervisor] handoff in 5 ms — no client was disconnected
```

**Aucune boîte de déconnexion**, les deux personnages restent sur leur carte, et
une action envoyée juste après (ouverture d'un atelier) passe sur la même
session. `select count(*) from gatherable_cell_states where reserved_until >
now()` → **0**.
