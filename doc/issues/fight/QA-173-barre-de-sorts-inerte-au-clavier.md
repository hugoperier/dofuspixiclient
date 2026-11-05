---
id: QA-173
title: La barre de raccourcis ne bascule pas en combat et n'a aucune touche de combat
severity: P1
domain: fight
type: gap
status: fixed
session: 1
opened: 2026-09-09
closed:
fixed_in:
related: [QA-007]
files:
  - apps/electrobun/src/game/stores/shortcuts-store.ts
  - apps/electrobun/src/game/stores/hotbar-fight-sync.ts
  - apps/electrobun/src/game/stores/spells-store.ts
  - apps/electrobun/src/hud/banner/hotbar-actions.ts
  - apps/electrobun/src/hud/banner/BannerReact.tsx
  - apps/electrobun/src/hud/core/keybindings.ts
  - apps/electrobun/src/hud/options/OptionsPanel.tsx
  - apps/electrobun/src/components/ui/main-banner.tsx
  - apps/electrobun/src/window/mainview/MapRenderer.tsx
---

## Symptôme

QA-007 a rendu la barre vivante hors combat : les 14 slots se remplissent, le
glisser-déposer marche, les raccourcis objets se rejouent à la connexion. En
combat elle ne sert à rien.

- La barre s'ouvre sur l'onglet « Sorts » à la connexion, où un clic ne fait
  rien puisque 1.29 refuse de lancer depuis la carte, et elle reste sur
  l'onglet courant quand un combat démarre.
- `1` à `7` et `Ctrl+1` à `Ctrl+7` ne font rien en mode « Sorts » :
  `activateSlot` sortait dès que l'onglet n'était pas « Obj. »
  (`hotbar-actions.ts:33-35`).
- Aucune touche ne termine le tour. `NEXTTURN` était déclaré
  (`keybindings.ts:83`) mais n'était enregistré nulle part.
- La molette ne fait rien au survol de la barre ; seules les flèches
  paginent.
- Chaque cellule de sort porte un chiffre de coût en PA que le client
  canonique ne dessine jamais.
- Aucun écran ne permet de changer un raccourci : `Keybindings.rebind()`
  n'avait aucun appelant.

## Attendu (1.29)

`Banner.setFightMode()` bascule `MouseShortcuts` sur `TAB_SPELLS` à l'entrée en
combat et restaure l'onglet de jeu à la sortie. `MouseShortcuts.onShortcut`
route `SH1`..`SH14` vers `click({keyBoard:true})` sur la cellule, ce qui
*sélectionne* le sort et arme le curseur — le lancement vient du clic sur la
case. `MouseShortcuts` ne peint que le compteur de relance sur l'icône, jamais
le coût en PA. Les accords sont modifiables et persistés dans un `SharedObject`.

## Correctif

- `shortcuts-store` s'ouvre sur `items`. `hotbar-fight-sync` bascule sur
  `spells` à l'entrée en combat et revient à `items` à la sortie, **sur
  transition seulement** : une bascule manuelle au `SWAP` doit survivre au
  reste du combat.
- `spells-store` expose `spellAtSlot`, la projection `position → SpellEntry`
  que la bannière et le clavier partagent désormais — c'est la règle que
  QA-007 s'était donnée et que la copie en ligne dans `BannerReact` avait
  déjà commencé à défaire.
- `activateSlot` se branche sur l'onglet : objets → utiliser / équiper ;
  sorts **et** combat en cours → `fightSelectSpell` ; sorts hors combat →
  inerte.
- `Keybindings` accepte plusieurs accords par action (le bundle retail a les
  mêmes colonnes `k2`/`c2`) et devient une instance de module, pour que le
  panneau d'options atteigne celle qui écoute. `NEXTTURN` est câblé sur
  `fightPassTurn`.
- **Divergences assumées, documentées dans `keybindings.ts`** :
  `NEXTTURN` = `Ctrl+Fin` (retail `F1`, capté par le navigateur),
  `SWAP` = `Maj+<` (retail `<` nu, un caractère imprimable),
  `SH0` = `²` **ou** `0`.
- Molette sur la grille = pagination, via un écouteur natif non passif :
  React attache `wheel` en passif à la racine et `preventDefault()` y est
  inopérant.
- Le badge de PA disparaît des cellules ; le coût reste dans l'infobulle.
- Nouveau panneau **Options**, onglet Raccourcis : capture de touche, refus
  d'un accord déjà pris, retour aux valeurs par défaut. Ouvert par `o` et par
  `Échap` quand rien n'est ouvert — 1.29 passe par un menu Échap dont Options
  est la première entrée, et il n'existe aucune icône d'options dans
  `BANNER_ICONS` sur laquelle accrocher un bouton de bannière.
- `FightSpellBar.tsx` est supprimé : plus monté depuis que la bannière porte
  la barre, il lisait `position` autrement et re-divergeait à chaque passage.

## Vérification

```bash
cd apps/electrobun
bun test src/game/stores/hotbar-fight-sync.spec.ts src/hud/core/keybindings.spec.ts
bun run check-types
```

À la main, dans le client lancé (`just dev`) :

1. À la connexion, la barre est sur « Obj. ». Aucune cellule ne porte de
   chiffre de PA.
2. `Maj+<` bascule, la molette au survol change de page.
3. À l'entrée en combat la barre passe seule sur « Sorts » ; `Maj+<` bascule
   quand même et la bascule tient jusqu'à la fin du combat.
4. `1`..`7` et `Ctrl+1`..`Ctrl+7` sélectionnent le sort du slot (anneau doré,
   zone de portée teintée). Hors combat, rien.
5. `Ctrl+Fin` termine le tour.
6. Champ de chat actif : taper `1234567`, `²`, `0`, `<` écrit le texte sans
   déclencher une seule action de combat.
7. Options (`o`), rebinder `NEXTTURN` sur `F1` : `F1` termine le tour,
   `Ctrl+Fin` ne le fait plus, et le rebind survit à un rechargement.
