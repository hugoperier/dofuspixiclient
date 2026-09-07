# Premier combat PvM autoritaire

## État des lieux et choix

Le projet possédait déjà `Fight`, `PlacementState`, `ActiveState`, `Runner`, `FightMap`, `CastSpellUseCase`, `EffectRegistry`, une IA et les messages GA/GAS/GAF, GTS/GTF/GTM/GTL, GP/GR et GE. Le client avait une machine de combat, les overlays et une barre de sorts dans la bannière. Cette implémentation prolonge ces composants.

Les lacunes constatées étaient le chevauchement des handlers de déplacement combat/exploration, les actions asynchrones non sérialisées, le rang demandé par le client, les cooldowns absents, plusieurs restrictions de sorts non contrôlées, les murs absents de la LoS serveur, les statistiques simplifiées des monstres, un placement de secours hors des cellules autorisées et une lecture inversée durée/probabilité. Le registre d'effets contenait aussi des mécanismes partiels qui ne suffisaient pas à déclarer un sort jouable.

## Flux

1. Cliquer sur un groupe existant de monstres. Sa réservation et celle du joueur empêchent deux créations concurrentes. Les données de la carte fournissent placement, walkability et obstacles de vue.
2. Placement sur les cellules de son équipe, Ready réversible ; départ quand tous les participants sont prêts ou après 45 secondes en PvM. Le joueur prêt ne peut plus changer de cellule.
3. `Runner` impose un seul tour de 30 secondes, l'initiative et l'alternance des équipes. PA/PM viennent des caractéristiques. Joueur, IA et échéances passent par la file d'actions du combat ; une action d'un ancien tour est rejetée.
4. Le client demande GA1/GA300. Le serveur valide tout le chemin avant de consommer les PM puis avance case par case, avec tacle et déclencheurs. Les sorts utilisent le rang appris, coût, min/max PO, PO modifiable, ligne, LoS, cellule vide, états, cooldown et limites par tour/cible.
5. GA annonce le lancement puis les effets ; GTM synchronise les ressources, positions et états ; GAF termine ou explique le refus au demandeur. Les cooldowns utilisent SC. Les ajouts sont des champs des messages existants, sans nouveau protocole parallèle.
6. Mort, cellule libérée et détection d'équipe éliminée ; arrêt du runner ; GE avec résultats, XP, kamas et drops issus du service existant. Le client termine les animations avant de rendre l'exploration et affiche les gagnants/perdants.

## Couverture et limites explicites

Voir [la matrice générée des 12 classes](spell-coverage.md), qui détaille chaque sort et chaque rang, y compris les dépendances de glyphes/pièges. Les sorts incomplets restent visibles dans le grimoire et bloqués dans la barre et sur le serveur avant dépense.

Le socle prend en charge dégâts élémentaires, soins, vol de vie, plusieurs bonus/malus de caractéristiques et résistances, gains/retraits PA/PM, téléportation, échange de positions, poussée/attirance, pièges et glyphes dont les déclencheurs sont des dégâts directs. Les zones et la LoS partagent `@dofus/grid`. Le tacle est probabiliste, sans les caractéristiques modernes fuite/tacle.

Travail restant avant une fidélité complète de chaque classe :

| Classe | Mécaniques particulières à finaliser et vérifier |
| --- | --- |
| Féca | Armures, renvois, Immunité, Trêve, glyphes de retrait/états |
| Osamodas | Créatures invoquées issues des templates, IA, limite d'invocation et buffs réservés aux invocations |
| Enutrof | Coffre, désenvoûtement et interactions de corruption |
| Sram | Invisibilité avec occultation réseau, Double, poisons et pièges à effets différés |
| Xélor | Probabilités exclusives des gains de PA, renvois, rollback et cadran |
| Ecaflip | Tirages exclusifs, effets conditionnels et états de Roulette/Chance |
| Eniripsa | Lapino, désenvoûtement et effets à durée particuliers |
| Iop | Vitalité, états et particularités des sorts spéciaux |
| Crâ | Effets spéciaux et déclencheurs des flèches concernées |
| Sadida | Poupées, poisons, transformations et arbres |
| Sacrieur | Châtiments, Sacrifice, transfert de vie, invocations ; Transposition/Coopération vérifient déjà le camp cible |
| Pandawa | Porter/jeter, porté/porteur, saoul/sobre, Stabilisation, tonneau et Pandawasta |

Les variantes à probabilités exclusives et les dégâts différés sont volontairement bloqués. L'IA actuelle choisit un ennemi, contourne les obstacles et essaie ses sorts ; ce n'est pas encore une IA spécialisée pour chaque famille. Une déconnexion abandonne le combat via la même file d’actions ; la reprise de session reste à développer. Les défis PvP, spectateurs, reconnexion en cours de combat, arme équipée et reprise après crash ne sont pas certifiés par cette livraison PvM. Les récompenses réutilisent les formules du projet, sans prétendre certifier l'économie historique.

## Données et références

La migration `0062_combat_spell_semantics` relit les tuples sources plutôt que de permuter aveuglément les données déjà corrigées. Elle ajoute les états requis/interdits et restaure les jets, probabilités, durées et zones normales/critiques. Exécuter `bun run db:migrate` dans `apps/gameserver-ts`.

Les captures de `screenshot-ui/combats` guident placement, timeline, ressources et tableau de résultat. Les sources locales `assets/sources/client-code/dofus/aks/GameActions.as`, `extend/GameActionsEx.as`, `managers/GameManager.as`, `datacenter/Spell.as` et `ank/battlefield/utils/Pathfinding.as` guident les événements et coordonnées. Le catalogue local contient aussi du Retro ultérieur et ne suffit donc pas à certifier une règle 1.29. Les formules ont été recoupées avec les implémentations [Fight de StarLoco](https://github.com/StarLoco/StarLoco-Game/blob/master/src/org/starloco/locos/fight/Fight.java) et [SpellEffect](https://github.com/StarLoco/StarLoco-Game/blob/master/src/org/starloco/locos/fight/spells/SpellEffect.java), qui sont des références d'émulateur, pas une spécification Ankama.

## Vérification

Les tests ciblés couvrent les refus sans dépense, rang falsifié, PA, portée/LoS/ligne/cellule, états/cooldown, invalidation d'un ancien tour, application unique, sérialisation après rejet, chemin complet, piège intermédiaire, tacle et contournement par l'IA. Un test traverse les vrais handlers Ready et GA, la lifecycle, le runner et les emitters avec des ports de données contrôlés. Le client teste la conservation du résultat puis la remise à zéro pour un second combat, ainsi que les handlers de carte existants.

Commandes :

```sh
bun run contracts:build
bun run contracts:verify
cd apps/gameserver-ts
bunx tsc --noEmit
bun test src/core/modules/fight src/core/features/game/move/move.handler.spec.ts
bun run scripts/audit-combat-spells.ts
cd ../electrobun
bunx tsc --noEmit
bun test ./src/game/machines/fight.machine.spec.ts ./src/game/network/handlers/map.handler.spec.ts ./src/game/network/handlers/map.handler.walk.spec.ts
cd ../../packages/grid
bun test src
```

## Validation en navigateur — 7 septembre 2026

Sur les services locaux réels (gateway, authd, gamed, PostgreSQL et client Vite), avec un compte de développement dédié :

- Féca niveau 1 contre trois Pious : placement déplacé sur une cellule rouge, Ready, tours chronométrés, déplacement de deux cases/deux PM, Attaque Naturelle, Glyphe Agressif et dégâts déclenchés au début du tour. Mort du personnage par attaques ennemies, résultat perdant et retour au point de sauvegarde.
- Féca de test porté au niveau 50 par la commande admin existante, sorts améliorés via le grimoire : second engagement après le résultat, déplacement de trois cases/trois PM, glyphes et attaques, mort de chaque Piou puis victoire. Résultat observé : 130 XP, 26 kamas, trois drops (287, 6903, 8242), durée 4 min 36 s. Les récompenses ont été validées avant émission du résultat.
- Vérification visuelle des PA/PM dès le placement, masquage du PNJ, portraits et couleurs de la timeline, sorts grisés, zones de portée et résultat beige. Le changement de placement conserve désormais les accessoires et les templates d’objets sont envoyés avant GE pour leurs noms/icônes.

Les régressions supplémentaires testées concernent l’expiration des glyphes au tour du lanceur, l’abandon sur déconnexion, l’IA déjà au contact, l’unicité de la récompense, l’ordre transaction → objets → templates → résultat et le rafraîchissement des statistiques sans montée de niveau. Une transaction rejetée n’annonce ni objet ni victoire ; la reprise automatique après une panne de persistance reste hors de cette première version.

Résultat final : 128 tests serveur, 48 tests de grille et 14 tests client réussis ; TypeScript client/serveur et vérification isolée des contrats sous Node/Bun réussis. Biome ne remonte que deux avertissements préexistants dans le générateur de groupes de monstres. Le dernier contrôle navigateur confirme les accessoires après repositionnement + Ready et l’abandon propre ; aucune erreur de console dans cette session finale.
