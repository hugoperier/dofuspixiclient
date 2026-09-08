# Régressions du combat — 8 septembre 2026

**Livraison incomplète.** Les correctifs d’interaction et de séquencement sont implémentés et testés. La validation navigateur n’a pas pu être exécutée : le contrôle de Chrome signale que le Mac est verrouillé. L’audit des modules trouve encore **68 graphiques avec des symboles absents**. Ni les huit régressions dans leur ensemble, ni les 264 sorts ne sont certifiés visuellement.

## Correctifs et reproductions automatisées

| Symptôme / risque | Reproduction et changement |
| --- | --- |
| Terrain détaché pendant un chargement | `scene/map/handler.spec.ts` retarde le préchargement, termine deux cartes dans l’ordre inverse et vérifie l’attachement du terrain et du combattant. Le remplacement des tuiles intervient après le chargement, avec un numéro de génération. |
| Combattants perdus pendant un zoom | `scene/battlefield/zoom.spec.ts` reproduisait la disparition du combattant lors du rendu complet. Le zoom conserve désormais les acteurs, remplace les tuiles et abandonne une opération appartenant à une ancienne carte. |
| Capture GPU en erreur | `scene/map/transition.spec.ts` injecte une erreur dans le vrai chemin de capture. La position de la carte est restaurée, les ressources temporaires sont libérées et le chargement peut continuer. |
| Réponses tardives d’une ancienne carte | Tests des vrais handlers réseau et de `BattlefieldWorldActors` : fin de déplacement, fin de chargement du personnage et picking ne doivent pas réintroduire les données de l’ancienne scène. |
| Décors interactifs en combat | `scene/battlefield/combat-picking.spec.ts` passe par le vrai picking Pixi : ressource sélectionnable en exploration, menus fermés à l’entrée, zone interactive traversable en combat, combattant toujours ciblable. |
| Preview hors budget / hors tour | `hud/fight/hover-preview.spec.ts` vérifie le trajet entier, les PM et l’effacement immédiat au changement d’état. Survol et clic partagent `fight-movement-targeting.ts`. |
| Cible de sort invalide | `game-client.combat.spec.ts` appelle les vrais points d’entrée de `GameClient` : sélection et overlays annulés, aucun paquet de lancer et aucun déplacement. |
| Clics pendant une animation | La sélection préparée reste modifiable. Le HUD expose l’action en cours. Un clic valide pendant l’animation n’est pas mémorisé ; un nouveau clic est requis ensuite. Les callbacks gardent la version de sélection et le contexte de présentation. |
| Déplacements simultanés | Les tests des vrais `FightHandler` et `MapHandler` prouvent que le deuxième combattant attend le premier. Les segments continus d’une action sont fusionnés ; une interruption par un piège reste une frontière. La locomotion utilise le trajet logique : 1–2 pas en marche, au moins 3 en course. |
| Visuel 610 bloqué | Le parent et l’enfant ont des timelines distinctes, des textures et des transformations distinctes. 30 départs aléatoires sont testés, avec un impact et une fin uniques. Même correction pour 1005 et 2112, testés sur 90 et 15 départs. |
| Assets vides | 1100, 402, 505 et 1101 ont été reconstruits depuis les exports source. Le compilateur lit aussi les atlas paginés et vérifie la table de frames réelle. Les 145 DASF ont été recompilés et publiés localement. |

Ces reproductions de rendu établissent des défauts précis, mais **ne prouvent pas encore la cause de l’écran noir intermittent signalé dans Chrome**.

## Présentation et protocole

`CombatPresentation` remplace les files concurrentes par un flux ordonné. Chaque action distingue impact, fin bloquante et nettoyage visuel. Le contexte de combat est annulable ; une ancienne animation ne peut modifier le combat suivant. Un asset absent produit une erreur explicite ; une présentation bloquée est annulée après 15 secondes.

GAS/GAF portent `action_id` et `fight_id`. GTR/GT portent `fight_id` et `turn_epoch`. `GameJoin` annonce le combat. Les protobuf sont régénérés. Le serveur conserve l’autorité sur les résultats ; il attend les participants connectés, sans les spectateurs, avant le nouveau tour. Une réponse ancienne est ignorée. Déconnexion, arrêt et échéance de 15 secondes libèrent la barrière ; le chronomètre du nouveau tour démarre ensuite. `turnOpen` empêche les commandes pendant cette attente.

Les overlays sont créés une fois par combat et restent les mêmes au passage placement → tours. Les inscriptions des renderers du monde et du combat sont distinctes. Les fichiers graphiques et leurs modules sont préchargés dès le placement ; la rasterisation reste faite à la demande pour ne pas remplir l’atlas GPU avec tous les rangs et toutes les invocations.

## Vérifications

| Contrôle | Résultat |
| --- | --- |
| Combat / sorts serveur | 2 273 tests réussis |
| Client jeu et HUD combat | 524 tests réussis |
| Grille | 48 tests réussis |
| Compilation d’atlas paginés | 1 test réussi |
| TypeScript client / serveur | Réussi |
| Contrats Node/Bun et packages générés | Réussi |
| Biome sur les fichiers contrôlés | Aucune erreur ; avertissements restants, notamment assertions non nulles |
| Tables compilées | 145 / 145 graphiques avec animations et frames |
| Cycles de vie des modules | 1 740 scénarios : rangs 1/6 × deux directions × trois graines pour chacun des 145 graphiques, sans échec de terminaison |
| Symboles demandés | **Échec : 68 graphiques**, liste exacte dans `animation-audit.json` |
| Entrées navigateur froid / chaud, plusieurs cartes | **0 / 20 exécutées dans cette correction** |
| Sorts observés et preuves par classe | **0 / 264 validés dans cette correction** |

Le contrôle de cycle de vie emploie des textures CPU factices en respectant le nombre de frames des tables compilées. Il mesure les appels, impacts et fins ; il ne contrôle pas les pixels, masques, couches ou ancrages GPU. L’audit des symboles reste indépendant : une timeline qui se termine avec un dessin absent est un échec d’asset.

Les modules demandent notamment des noms `lib_sprite…` alors que plusieurs exports contiennent seulement des composites ou des sprites portant d’autres noms. Un alias automatique ne prouve pas que le dessin correspond, et peut superposer un enfant déjà inclus dans son parent. Leur reconstruction et la vérification visuelle restent à faire. La matrice expose ces échecs par sort et dépendance ; elle ne réduit plus la couverture graphique à l’existence du fichier.

Commandes depuis leurs répertoires respectifs :

```sh
# apps/electrobun
bun test ./src/game ./src/hud/fight
bunx tsc --noEmit
bun ./scripts/audit-spell-animations.ts

# apps/gameserver-ts
bun scripts/audit-combat-spells.ts --verify
bunx tsc --noEmit

# packages/grid puis packages/dofasset-format
bun test ./src

# racine
bun run contracts:verify
```

Les deux audits graphiques retournent actuellement un statut d’échec à cause des 68 graphiques incomplets, même lorsque les tests mécaniques passent. Leurs sorties ne doivent pas être présentées comme une validation complète.

Aucune migration ajoutée ou nécessaire pour ces corrections. Les modifications locales existantes de rendu, audio et mécaniques des classes sont conservées.

## Reprise navigateur

Après déverrouillage du Mac : reprendre la reproduction de l’écran noir, enregistrer messages/chargements/couches/erreurs WebGPU, puis les 20 entrées réparties entre caches froid et chaud et plusieurs cartes. Vérifier placement, Prêt, mode tactique, clics rapides, refus, mort intermédiaire, ennemis successifs et retour en exploration. Conserver les captures et résultats par classe avant de marquer un sort comme visuellement validé.
