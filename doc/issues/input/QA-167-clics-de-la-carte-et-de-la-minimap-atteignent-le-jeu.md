---
id: QA-167
title: "Clics et molette de la carte du monde et de la minimap atteignent le jeu dessous"
severity: P1
domain: input
type: bug
status: fixed
session: 6
opened: 2026-09-07
closed:
fixed_in:
related: [QA-166, QA-047]
files:
  - apps/electrobun/src/game/input/interaction-handler.ts
  - apps/electrobun/src/game/scene/battlefield-scene.ts
  - apps/electrobun/src/window/mainview/MapRenderer.tsx
  - apps/electrobun/src/hud/minimap/Minimap.tsx
  - apps/electrobun/src/game/worldmap/world-map-renderer.ts
---

## Symptôme

Carte du monde ouverte, tout ce qu'on y fait agit **aussi** sur le jeu derrière :
la molette zoome la carte de jeu en même temps que la carte du monde, un clic
déplace le personnage.

Le clic sur la **minimap de la bannière** déplace lui aussi le personnage, et
vers une case qu'on ne pourrait normalement pas atteindre au clic.

## Attendu (1.29)

Un écran plein canevas capte sa souris. La carte du monde ne déplace personne.

## Cause

Deux chemins distincts, tous les deux côté client.

**La carte du monde.** Les gestionnaires de souris du jeu sont posés sur
`app.stage` (`battlefield/bootstrap.ts:219-222`), qui est un **ancêtre** du
conteneur de la carte du monde. Les événements Pixi remontent : le clic
atteignait sa cible dans la carte du monde, puis continuait jusqu'au stage et
devenait un `onGroundClick`. Même chose pour la molette, dont le listener DOM
est posé sur le canevas (`interaction-handler.ts:67`) — deux écouteurs sur le
même canevas, les deux répondaient.

`InteractionHandler` avait pourtant le drapeau qu'il fallait, `_enabled`, mais
il ne gardait que `handleWheel` : `handlePointerDown`, `handlePointerMove` et
`handlePointerUp` ne le lisaient pas. Et son setter `enabled` n'avait **aucun
appelant** dans tout le dépôt.

**La minimap.** `MainBannerCircle` est en `pointer-events-none`
(`main-banner.tsx:734`) et `Minimap` rendait un `<div className="absolute
inset-0" />` sans rien redéfinir. Les clics traversaient donc jusqu'au canevas
du jeu. La bannière étant en bas de l'écran, le point traversé était converti
en une case de la carte courante souvent hors de la zone visible — d'où
l'impression d'atteindre une case inaccessible.

**Le serveur, lui, tient.** `validatePath`
(`modules/maps/maps.validate-path.ts:59-140`) vérifie la longueur, la direction,
l'adjacence, les bornes et la marchabilité de chaque pas, et tronque le chemin
au premier pas non marchable en exploration. Aucun de ces clics ne pouvait
poser le personnage sur une case non marchable ni le téléporter : ce qui se
voyait était un déplacement légal vers une case simplement absurde. Ce n'est
donc pas une faille d'autorité, seulement une fuite d'entrées.

## Correctif

`InteractionHandler._enabled` garde maintenant les quatre gestionnaires, et son
setter éteint le survol et annule un drag en cours au passage — sinon ils
restaient allumés derrière le panneau. `BattlefieldScene.setInputEnabled()`
l'expose, et `MapRenderer` s'abonne à `hudStore` pour couper la souris du jeu
tant que `isWorldMapOpen`.

Le renderer de la carte du monde appelle en plus `stopPropagation()` sur ses
événements de pointeur : la coupure explicite est la vraie réponse, mais ça
ferme le chemin à la source pour tout autre écouteur qui vivrait sur le stage.

La minimap passe en `pointer-events-auto`. La pastille de survol qui déplie le
cercle vient après elle dans le DOM et garde ses 37 px centraux.

## Vérification

- `bun test ./src/game/input/interaction-handler.spec.ts` — cinq cas : le clic
  déplace quand la souris du jeu est active, ne déplace plus quand elle est
  coupée, ne survole ni ne teste le picking, ne relâche pas un drag entamé
  avant la coupure, et retrouve son comportement une fois rétablie.
- Manette en main : ouvrir la carte du monde, glisser et molette — le décor
  derrière ne bouge pas ; fermer, la souris du jeu répond à nouveau. Cliquer la
  minimap de la bannière ne déplace plus le personnage.
