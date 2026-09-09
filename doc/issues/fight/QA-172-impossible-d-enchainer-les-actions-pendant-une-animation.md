---
id: QA-172
title: "Impossible d'enchaîner les actions en combat tant qu'une animation joue"
severity: P2
domain: fight
type: feature
status: fixed
session: 9
opened: 2026-09-09
closed:
fixed_in:
related: [QA-170]
files:
  - apps/electrobun/src/game/game-client.ts
  - apps/electrobun/src/game/machines/fight-movement-targeting.ts
  - apps/electrobun/src/game/machines/spell-cast.machine.ts
  - apps/electrobun/src/game/network/handlers/fight.handler.ts
  - apps/electrobun/src/hud/fight/hover-preview.ts
  - apps/electrobun/src/hud/banner/BannerReact.tsx
---

## Symptôme

En combat, il fallait attendre la fin de l'animation d'un sort avant de
pouvoir se déplacer ou relancer quoi que ce soit. Un clic pendant ce temps
ne produisait rien du tout. Sur les sorts longs le tour se jouait au rythme
des animations, pas à celui du joueur.

## Attendu

Toutes les animations continuent de se jouer les unes après les autres, mais
rien n'empêche le joueur d'enchaîner. C'est une décision de produit, pas une
correction de conformité : le blocage précédent était délibéré, et il est
assumé de s'en écarter pour la sensation de fluidité.

## Cause

Rien côté serveur. `FightActionsService` sérialise déjà les actions dans
`runAction`, résout chacune entièrement et diffuse `gameActionsStart`, les
trames, puis `gameActionsFinish`. Il n'a jamais attendu le client.

Le blocage était client, en trois couches.

**La barrière d'animation.** `presentationPending`, levé par la file de
présentation, était consulté par six verrous d'entrée : le calcul de chemin,
les deux branches du clic en combat, le passage de tour, l'aperçu au survol
et la bannière.

**La position.** `MapHandler` ne validait la cellule du joueur qu'après
l'animation de marche. Trois lecteurs s'appuyaient dessus. Enchaîner deux
déplacements aurait donc envoyé un chemin partant de l'ancienne cellule, que
le serveur aurait refusé. Le magasin de combat, lui, appliquait déjà la trame
de mouvement à la réception : la bonne cellule était disponible, personne ne
la lisait.

**La machine de sort.** Elle quittait `pending` depuis l'intérieur de la file
de présentation, donc elle y restait tant que l'arriéré n'était pas écoulé, et
le clic était refusé hors des états inactif, ciblage ou rejeté.

## Correctif

Le principe : la file de présentation ne gouverne que le rendu. Les décisions
lisent l'état des trames, jamais celui des sprites.

- `myFightCell()` lit ma cellule dans le magasin, avec repli sur le
  gestionnaire de carte hors combat. Branché sur le clic, l'anneau de PM et
  l'aperçu au survol.
- `presentationPending` ne commande plus rien. Il reste dans le magasin comme
  simple indicateur. Le bandeau « Animation en cours » disparaît.
- L'accusé du serveur passe au moment de la trame, plus depuis l'animation.
  Le clic n'est refusé que pendant `pending`, jamais pendant `animating` ni
  `resolving`.
- `CASTER_MOVED` recentre un sort déjà sélectionné quand le joueur bouge,
  sans incrémenter la version de sélection, qui invalide les rappels des
  lancers encore en vol.
- Le surlignage bleu du chemin choisi n'est effacé que lorsque le sprite
  atteint la cellule pour laquelle il a été peint, sinon un déplacement
  terminé effacerait le tracé de celui rangé derrière.
- Un clic tombé pendant l'aller-retour serveur est mémorisé et rejoué à la
  réponse. Un seul, remplacé par le suivant.
- `actionPending` devient la seule barrière, donc une échéance de 3 secondes
  la relâche si `gameActionsFinish` se perd.

Garder `actionPending` n'est pas un compromis. Cette trame arrive après le
mouvement, les pertes de PA et de PM, le tacle éventuel et l'instantané
complet : quand elle tombe, le magasin est à jour et l'action suivante se
calcule sur les chiffres que le serveur validera.

Conséquence assumée : pendant un déplacement enchaîné, l'anneau de PM est sur
la cellule d'arrivée alors que le sprite marche encore vers elle. L'anneau
répond à « d'où puis-je partir maintenant », et c'est cette cellule-là que le
serveur vérifiera.

## Vérification

```bash
cd apps/electrobun && bun test src/game/game-client.combat.spec.ts
```

Neuf cas, dont : un lancer part pendant qu'une animation précédente joue ; une
action rangée derrière une marche part de la cellule d'arrivée ; un sort tenu
prêt suit son lanceur ; un clic pendant l'aller-retour est rejoué ; seul le
dernier clic d'une rafale l'est ; et il est abandonné si le tour change.

À rejouer à la main : lancer un sort à longue animation puis cliquer aussitôt
pour se déplacer, enchaîner déplacement et sort, et vérifier qu'aucune
animation n'est coupée au changement de tour.
