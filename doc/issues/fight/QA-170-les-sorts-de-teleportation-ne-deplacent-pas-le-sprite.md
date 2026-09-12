---
id: QA-170
title: "Les sorts de téléportation ne déplacent pas le sprite du personnage"
severity: P1
domain: fight
type: bug
status: fixed
session: 9
opened: 2026-09-09
closed:
fixed_in:
related: [QA-168, QA-171]
files:
  - apps/electrobun/src/game/game-client.ts
  - apps/electrobun/src/game/game-client.combat.spec.ts
---

## Symptôme

En combat, aucun sort de téléportation ne bouge le personnage à l'écran. Le
jeu se comporte comme si le déplacement avait eu lieu — les PA sont débités,
la timeline et le survol donnent la nouvelle cellule, les sorts suivants
partent bien de là — mais le sprite reste posé sur l'ancienne cellule.

## Attendu (1.29)

`GA;4` (`ACTION_SPRITE_POSITION`) repositionne le sprite sur la cellule
annoncée, sans animation de marche. C'est la seule trame que le serveur
émette pour un déplacement instantané : téléportation, poussée, attirance,
échange de place et retour aux positions initiales passent tous par elle.

## Cause

`game-client.ts`, handler `onTeleport` : la trame était routée vers
`battlefield.getFightUI().teleportPlayer(...)`.

`FightUI` possède son propre `PlayerRenderer`, mais personne ne l'alimente —
`FightUI.addPlayer` n'a aucun appelant dans le dépôt. Les combattants sont
tous ajoutés par `scene/battlefield/world-actors.ts` dans un **second**
`PlayerRenderer`, celui que `battlefield.getWorldActorRenderer()` expose.

`PlayerRenderer.teleportPlayer` commence par `this.players.get(id)` et sort
sans rien faire quand l'id est inconnu. Chaque téléportation tombait donc
dans le vide, en silence. La mise à jour logique, elle, se faisait bien : le
même `case "spritePosition"` de `fight.handler.ts` envoie un `FIGHTER_UPDATE`
au store, d'où l'écart entre la cellule connue et le sprite affiché.

Le même piège avait déjà été corrigé juste à côté pour `onDirectionChange`,
dont le commentaire décrit précisément ce mode de panne. `onTeleport` était
le dernier appel resté sur le mauvais renderer.

## Correctif

`onTeleport` passe par `getWorldActorRenderer()`. Un commentaire sur place
rappelle pourquoi, et un test verrouille le routage.

Cela répare du même coup, sans qu'elles aient été testées à la main, toutes
les autres sources de `GA;4` : poussée (effet 5), attirance (6), échange de
place (8), Bruit-qui-fait-fuir (783) et retour aux positions initiales (784).

## Vérification

```bash
cd apps/electrobun && bun test src/game/game-client.combat.spec.ts
```

`a sprite-position frame moves the sprite, not just the fight store` : la
trame `GA;4` doit atteindre le renderer des combattants, jamais celui de
`FightUI`, et le store doit suivre. Le test échoue sur le code d'avant.

À rejouer à la main : Téléportation (Xelor), une poussée et un échange de
place, en vérifiant que le sprite arrive bien sur la cellule surlignée.

`bun test` depuis `apps/electrobun` ne rendait pas la main sur une seule
ligne au moment où ce correctif a été écrit ; c'est réglé par QA-171.
