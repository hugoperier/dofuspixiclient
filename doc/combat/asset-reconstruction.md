# Reconstruction des assets combat

L'audit couvre les identifiants positifs de tous les rangs et de leurs dépendances, ainsi que les sprites d'invocations, de Double et de transformation. Il vérifie les binaires DASF, les métadonnées et l'existence du module graphique requis ; les empreintes sont dans `spell-coverage.json`. La présence de ces fichiers ne vaut pas observation du rendu.

## Graphique 810 : Concentration et Brokle

Le catalogue demande 810. Ce fichier manquait ; le remplacer par 410 afficherait un autre visuel. Le SWF provient d'une [archive du client Dofus 1.29](https://gitlab.com/bouh2pmg/Client-Dofus-1-29/-/raw/43305756/Client/clips/spells/810.swf), conservée au commit `43305756`.

- SWF : SHA-256 `8c59100d54a95a8f48a9088024f208915ff76b598332c21515c432027feedefe`.
- DASF publié : SHA-256 `615eb7c2656c2a300030eed28c49c04841db6bfe916db12f0426ccd3528ee3b5`.
- Timeline linéaire : 54 images à 20 images/s. Indices zéro : son `explosion` à 24, `end()` à 25, suppression du clip à 53. La position est celle de la cellule cible.
- L'analyse locale antérieure numérote ces repères après rééchantillonnage à 60 images/s. Les temps physiques restent les mêmes.

Le fichier `tools/combat-exporter/linear-spells.json` conserve les repères inspectés. Le merger refuse un SWF dont la cadence ou le nombre d'images diffère. Seuls les clips linéaires explicitement recensés utilisent le lecteur d'images ; les autres conservent leurs modules générés.

Depuis la racine du dépôt :

```sh
php tools/combat-exporter/bin/console extract:spell-anims --input assets/sources/clips/spells --output /tmp/retro-spell-export --spell 810
bun tools/svg-spritesheet/src/cli.ts /tmp/retro-spell-export assets/spritesheets/spells
bun tools/combat-exporter/merge-spell-manifests.ts /tmp/retro-spell-export assets/spritesheets/spells
bun tools/asset-pipeline/src/cli.ts compile spells --id 810
bun tools/asset-pipeline/src/cli.ts publish spells
```

Les dépendances PHP verrouillées sont nécessaires (`composer install` dans `tools/combat-exporter`). Le test client lit le DASF publié et vérifie l'ordre son → impact → fin, sans raccourcir l'animation à 1,5 seconde.

## Tables compilées et atlas paginés

Les noms du manifeste ne suffisaient pas à détecter une table de frames vide. Le lecteur DASF expose désormais les animations compilées et vérifie leurs références. Le pipeline accepte les atlas `atlas_0.svg`, `atlas_1.svg`, etc., conserve la page des frames et sépare les identifiants SVG de chaque page. Un test utilise deux pages avec des rectangles et des identifiants identiques, mais des dessins différents.

Les 145 graphiques ont été reconstruits, dont les quatre tables d’animations vides (1100, 402, 505, 1101). L’exécution des modules révèle encore **68 graphiques avec des symboles manquants** : [rapport des régressions](regression-validation.md), [audit détaillé](animation-audit.json). La présence des tables ne certifie ni ces symboles ni le résultat visuel.

## Timelines indépendantes : 610, 1005 et 2112

Sources dans `assets/sources/clips/spells`, provenant de l’archive locale du client 1.29 ; [archive de référence](https://gitlab.com/bouh2pmg/Client-Dofus-1-29/-/tree/43305756/Client/clips/spells). Le 610 local a été comparé au fichier de cette archive.

| Graphique | SHA-256 du SWF | Parent / enfant natifs | Repères AS2 locaux à 60 Hz, indices zéro |
| --- | --- | --- | --- |
| 610 | `57e9eb5f14bccf0c8b866f77d6ae522ecfc880c0e67101ce038bfdd49663c97c` | 20 / 9 | son et impact 6 ; fin parent 93 ; arrêt enfant 39 ; départ aléatoire 0…29 |
| 1005 | `c8296ca87386b0444168550493a67d03acea23a417c00baf72e49494b735fa92` | 21 / 20 | impact parent 99, fin 153 ; son enfant 90, arrêt 147, départ aléatoire 1…90 |
| 2112 | `a469a0ac7fa1a210dd4eec8d99ce51152cf71b82392f2585f52edac8b15cca21` | 19 / 17 | son et impact 6 ; fin parent 93 ; arrêt enfant 39 ; départ aléatoire local 0…14 |

Scripts décompilés : `tools/combat-exporter/output/spell-anims/<id>/scripts/scripts`. Les identifiants peuvent différer après conversion : pour 1005, les sprites locaux 24/23 correspondent aux sprites natifs 21/20. Son SWF annonce 25 Hz lorsqu’il est lu seul ; le module suit les repères des scripts locaux TRIPLEFRAMERATE, comme les autres modules. Les frames sources sont répétées trois fois. Le décalage de boîte englobante ajouté par le parseur est retiré avant d’appliquer les matrices de placement.

Règle retenue : `stop()` ou `gotoAndPlay()` de l’enfant n’agissent pas sur le parent. Le parent conserve ses événements et sa suppression ; chaque enfant possède son playhead et ses transformations. Cela suit les scripts locaux et la séparation des clips décrite dans la [référence ActionScript 2 MovieClip](https://open-flash.github.io/mirrors/as2-language-reference/MovieClip.html). Pour 1005, un conteneur de placement distinct évite d’écraser l’échelle et l’alpha aléatoires de l’enfant. Un départ directement sur la frame du son exécute ce son.

Extraction depuis la racine :

```sh
php tools/combat-exporter/bin/extract-610 assets/sources/clips/spells/610.swf /tmp/retro-independent-export/610 apps/electrobun/src/game/spells/spell-610-timeline.json 610
php tools/combat-exporter/bin/extract-610 assets/sources/clips/spells/1005.swf /tmp/retro-independent-export/1005 apps/electrobun/src/game/spells/spell-1005-timeline.json 1005
php tools/combat-exporter/bin/extract-610 assets/sources/clips/spells/2112.swf /tmp/retro-independent-export/2112 apps/electrobun/src/game/spells/spell-2112-timeline.json 2112
bun tools/svg-spritesheet/src/cli.ts /tmp/retro-independent-export assets/spritesheets/spells --parallel 3
bun tools/combat-exporter/merge-spell-manifests.ts /tmp/retro-independent-export assets/spritesheets/spells
bun tools/asset-pipeline/src/cli.ts compile spells
bun tools/asset-pipeline/src/cli.ts publish spells
```

Les 135 départs de ces trois modules ont un impact et une fin uniques. L’audit a aussi reproduit des suppressions au mauvais niveau dans 301, 303, 504, 801, 904 et 906, ainsi que l’absence d’attachement initial de 910. Les handlers des clips placés gardent maintenant leur parent local ; la suppression d’un enfant ne termine plus implicitement la racine. Les IDs modifiés sont protégés contre la génération automatique. Les symboles encore absents restent des échecs même lorsque le cycle de vie passe.

## Points de porté Pandawa

Sources : [sprite masculin 120](https://gitlab.com/bouh2pmg/Client-Dofus-1-29/-/raw/43305756/Client/clips/sprites/120.swf) et [sprite féminin 121](https://gitlab.com/bouh2pmg/Client-Dofus-1-29/-/raw/43305756/Client/clips/sprites/121.swf), même archive.

- 120 : SHA-256 `32e52e84d4e477f3faab81e6f76b6ddd1b3385460d2d77c7f2d0312f576adec2`.
- 121 : SHA-256 `6685a068f685b611796e5645b817859f6971b6ffb8b0e9f2ea6ab102abe0bde2`.

`CarriedAnchors.php` lit les placements et appels `GAC.registerCarried`, sans exécuter le code Flash. Il compose les transformations imbriquées et retire le décalage de boîte englobante ajouté par Arakne pour retrouver l'origine SWF. Un test SWF synthétique vérifie placement, déplacement, parent et suppression.

Après téléchargement des deux sources :

```sh
php -d memory_limit=512M tools/assets-exporter/bin/extract-carried-anchors /tmp/retro-pandawa-120.swf apps/electrobun/public/assets/spritesheets/sprites/120/metadata.json
php -d memory_limit=512M tools/assets-exporter/bin/extract-carried-anchors /tmp/retro-pandawa-121.swf apps/electrobun/public/assets/spritesheets/sprites/121/metadata.json
php tools/assets-exporter/tests/carried-anchors.php
```

Cette commande conserve les métadonnées préexistantes, notamment les accessoires, couleurs et repères audio. L'extraction complète `sprites:metadata` produit également ce champ. Les 16 poses par sexe disposent de points à leur cadence native ; le client les associe à la cadence des animations publiées et applique le retournement horizontal du personnage.

Les contrôles automatisés ne certifient pas encore le trajet visible du lancer, l'occultation par les autres sprites ni les effets propres à chaque rang : ces étapes restent dans la validation navigateur.
