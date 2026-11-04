# Marqueurs de combat et spectateurs

Recherche du 12 septembre 2026. Ce document distingue les observations des sources et les règles retenues pour le client et le serveur du projet. Il ne constitue pas un compte rendu de validation de l'implémentation.

## Sources et versions

| Source | Ce qu'elle établit | Limite |
| --- | --- | --- |
| [Client ActionScript local, Constants.as:17–22](../../assets/sources/client-code/dofus/Constants.as#L17-L22) | Comportement client, graphismes, interactions et messages | Le code déclare **1.43.7**, daté du 25 juin 2023 : c'est Retro récent, malgré l'objectif 1.29 du projet. |
| [Client retail local](../retail-client.md) | SWF originaux présents dans `Client-Dofus-1-29/Client/clips/sprites` | Les scripts du client récent ne prouvent pas que toutes ses extensions existaient en 1.29. |
| [Ancien client publié sous le nom Dofus-client-1.29](https://github.com/Guardian820/Dofus-client-1.29/blob/master/Source%20Client/By%20Name/dofus/Constants.as#L101-L125) | Antériorité des parcours rejoindre et spectateur | Le fichier Constants déclare en réalité **1.25**. Ne pas présenter cette copie comme une certification du client 1.29 exact. |
| [StarLoco-Game](https://github.com/StarLoco/StarLoco-Game) | Implémentation serveur consultable des marqueurs et spectateurs | Émulateur 1.39, pas code serveur Ankama : corroboration technique, pas preuve des règles officielles exactes. |

Aucune documentation Ankama accessible trouvée pendant cette recherche n'a permis de certifier les différences entre ces versions. Les règles de la livraison sont donc explicitement fixées ci-dessous.

## Comportement observé

### Marqueurs pendant le placement

`Gc+` crée un combat et ses camps sur la carte d'exploration. L'en-tête contient `fightId;fightType`, chaque camp `teamId;cellId;teamType;alignment`. Les cellules viennent du serveur. `Gc-` retire tous les marqueurs du combat. Les deux camps reçoivent la même `color1`, calculée par `(Math.cos(fightId) + 1) * 8388607`. Voir [GameIn.as:810–857](../../assets/sources/client-code/dofus/aks/extend/GameIn.as#L810-L857).

Le choix du graphisme dépend du type et de l'alignement du camp : joueur neutre `0.swf`, ange `1.swf`, démon `2.swf`, monstre neutre `3.swf`, percepteur `4.swf`. Les mutants utilisent l'épée normale. Les variantes de groupe `6/7/8.swf` existent dans le code récent, mais sont absentes du client retail 1.29 inspecté. Voir [Constants.as:122–130](../../assets/sources/client-code/dofus/Constants.as#L122-L130) et [getTeamFileFromType:266–318](../../assets/sources/client-code/dofus/Constants.as#L266-L318).

`Gt` ajoute et retire les membres d'un camp. Le client résout les noms de monstres, puis le survol du marqueur affiche les noms et niveaux ; le camp monstre affiche également son niveau total. Voir [GameIn.as:859–904](../../assets/sources/client-code/dofus/aks/extend/GameIn.as#L859-L904), [Team.as](../../assets/sources/client-code/dofus/datacenter/Team.as), [DofusBattlefield.as:1040–1062](../../assets/sources/client-code/dofus/graphics/battlefield/DofusBattlefield.as#L1040-L1062).

Le clic sur une épée propose de rejoindre le camp accessible. Le client distingue équipe complète et combat complet, et refuse de rejoindre le camp monstre en PvM. Le menu inspecté ne propose pas de devenir spectateur. Maj-clic et clic droit constituent des raccourcis d'entrée dans ce client. Voir [DofusBattlefield.as:566–665](../../assets/sources/client-code/dofus/graphics/battlefield/DofusBattlefield.as#L566-L665).

`Go` communique les options de camp : `H` appel à l'aide, `S` blocage des spectateurs, `A` verrouillage du camp, `P` groupe uniquement. Le client affiche leurs icônes au-dessus du marqueur. Voir [GameIn.as:906–930](../../assets/sources/client-code/dofus/aks/extend/GameIn.as#L906-L930).

### Liste et mode spectateur

La bannière ouvre une liste des combats de la carte : effectifs, durée, puis composition et niveaux cumulés des deux équipes après sélection. `fL` demande la liste et `fD` les détails. Le parseur accepte un temps `-1` pour les combats pas encore démarrés. Voir [Banner.as:1131](../../assets/sources/client-code/dofus/graphics/gapi/ui/Banner.as#L1131), [Fights.as:10–18 et 82–96](../../assets/sources/client-code/dofus/aks/Fights.as#L82-L96), [FightsInfos.as:57–115](../../assets/sources/client-code/dofus/graphics/gapi/ui/FightsInfos.as#L57-L115).

Le serveur indique explicitement le statut spectateur dans `GJK` : `state|cancelButton|readyButton|spectator|timerMs|fightType`. Le client nettoie la carte et ferme la liste, puis affiche les combattants, la timeline et le tour courant. Les PA/PM du joueur local, le bouton passer et les commandes de gestion du combat ne sont pas proposés au spectateur. Voir [Game.as:137–179](../../assets/sources/client-code/dofus/aks/Game.as#L137-L179), [Game.as:279–318](../../assets/sources/client-code/dofus/aks/Game.as#L279-L318), [FightOptionButtons.as:53–81](../../assets/sources/client-code/dofus/graphics/gapi/ui/FightOptionButtons.as#L53-L81).

Quitter comme spectateur envoie `GQ` directement, sans confirmation d'abandon. La sortie réinitialise l'état et recharge l'exploration. Une fin normale peut afficher les résultats, mais n'attribue ni n'historise les gains du spectateur. Voir [Banner.as:1144–1154](../../assets/sources/client-code/dofus/graphics/gapi/ui/Banner.as#L1144-L1154), [GameIn.as:933–965](../../assets/sources/client-code/dofus/aks/extend/GameIn.as#L933-L965), [GameManager.as:223–252](../../assets/sources/client-code/dofus/managers/GameManager.as#L223-L252).

Le code serveur StarLoco retire les marqueurs de la carte au passage à `ACTIVE`, avant `GS`. Il accepte les spectateurs uniquement après le démarrage, transmet le combat et le tour courant, cache les invisibles et expulse les spectateurs ordinaires quand le blocage est activé. Ce sont les comportements retenus ici, avec la réserve de version indiquée plus haut. Voir [Fight.java:1058–1078](https://github.com/StarLoco/StarLoco-Game/blob/master/src/org/starloco/locos/fight/Fight.java#L1058-L1078), [admission:2096–2141](https://github.com/StarLoco/StarLoco-Game/blob/master/src/org/starloco/locos/fight/Fight.java#L2096-L2141), [blocage:2154–2173](https://github.com/StarLoco/StarLoco-Game/blob/master/src/org/starloco/locos/fight/Fight.java#L2154-L2173).

Les codes d'action ont évolué : le client récent utilise `GA903fightId;teamId` pour combattre et `GA976fightId;-1` pour observer ; le client ancien utilise `GA903fightId` sans camp pour observer. Le projet conserve ses codes d'action existants, sans supposer une compatibilité filaire 1.29 supplémentaire. Voir [GameActions.as:46–61](../../assets/sources/client-code/dofus/aks/GameActions.as#L46-L61), [ancien FightsInfos.as:119–122](https://github.com/Guardian820/Dofus-client-1.29/blob/master/Source%20Client/By%20Name/dofus/graphics/gapi/ui/FightsInfos.as#L119-L122) et [ancien GameActions.as](https://github.com/Guardian820/Dofus-client-1.29/blob/master/Aks/GameActions.as).

## Règles retenues pour la livraison

- Périmètre : combats **PvM et défis**. Un joueur peut rejoindre le camp joueur d'un PvM ou un camp joueur d'un défi, dans la limite des places et des autorisations du serveur. Il ne peut pas rejoindre les monstres.
- Les marqueurs existent pendant le placement et disparaissent au démarrage ou à l'annulation. Le survol expose la composition du camp ; le clic permet de rejoindre un camp disponible.
- La liste de la carte contient **placement et combats actifs**. Elle montre l'état, les effectifs, les équipes et les niveaux ; le bouton **Regarder** est disponible uniquement pour un combat actif autorisant les spectateurs.
- Un spectateur appartient aux observateurs du combat, jamais à une équipe de combattants. Son arrivée reçoit un état cohérent du combat courant, y compris le tour et les effets déjà en cours. Les positions invisibles et les pièges cachés restent filtrés par le serveur.
- Le spectateur ne déplace aucun combattant, ne lance aucun sort, ne passe aucun tour et ne modifie aucune option de combat. Les contrôles serveur complètent les contrôles de l'interface.
- L'activation du blocage spectateur empêche les nouvelles entrées **et expulse les observateurs déjà présents**. Le spectateur peut quitter à tout moment ; sortie, expulsion et fin de combat rétablissent son exploration sans récompense ni pénalité d'abandon.
- Les demandes concurrentes avec démarrage, remplissage, fermeture ou fin sont revalidées sur l'état serveur courant. Une sélection devenue périmée ne doit pas créer un observateur ou un combattant orphelin.

Ces points sont les décisions fonctionnelles de la livraison ; la recherche ne certifie pas leurs branches PvP d'alignement, percepteur, mutant, groupe ni une compatibilité complète avec toutes les versions Retro.

## Extraction fidèle des deux graphismes

Les SWF inspectés viennent de `/Users/hugoperier/Projects/Lab/DofusManager/Client-Dofus-1-29/Client/clips/sprites`.

| Fichier | SHA-256 | Structure racine observée |
| --- | --- | --- |
| `0.swf` | `d6fbc3d43ceb768101b2515cccd46f2a711bfe3255002605704b0574cf6d3fb7` | Une frame à 12 Hz ; deux objets : `cercle` (symbole 2, exporté sous `circle`) et épée non exportée (symbole 4). |
| `3.swf` | `5c389537553038657df5097c657c4ca2d1a10b4b4f34d3e6f120cb652cd0d496` | Une frame à 12 Hz ; 25 objets : `cercle` (symbole 6) et composition de formes et images. Exports `6`, `7`, `circle`. |

L'extracteur de sprites parcourt uniquement les symboles exportés ; il ignore donc la composition racine qui constitue le marqueur. Réutiliser les seuls manifests `sprites/0` ou `sprites/3` ne reconstruit pas ces dessins. Voir [ExtractSpriteCommand.php:379–410](../../tools/assets-exporter/src/Command/ExtractSpriteCommand.php#L379-L410).

Une conversion de la racine en mémoire par `SwfExtractor::timeline()` puis `Converter::toSvg($timeline, 0)` produit 4 057 octets / 9 paths pour `0.swf`, et 44 751 octets / 101 paths / 7 éléments image pour `3.swf`. Ces chiffres attestent que le convertisseur accède à la composition ; ils ne remplacent pas une vérification visuelle.

Les actions racine des deux SWF appellent `GAC.applyColor(this.cercle, 1)`. **Seule la base circulaire reçoit `color1`**, identique entre les deux camps d'un combat. Les autres dessins gardent leur palette. L'application d'une couleur sur un clip conserve son alpha et remplace ses composantes RVB : [GlobalSpriteHandler.as:51–75](../../assets/sources/client-code/ank/battlefield/GlobalSpriteHandler.as#L51-L75).

L'extracteur de métadonnées actuel détecte `GAC.applyColor` dans les symboles exportés et `stringCourseColor` dans la racine, mais pas cet appel `GAC.applyColor` racine. Il renvoie effectivement des zones vides sur les deux fichiers. Le noir du cercle est partagé avec des contours du dessin : une zone globale « toutes les formes noires » colorerait aussi les monstres ou l'épée. Voir [ExtractStaticMetadataCommand.php:135–149](../../tools/assets-exporter/src/Command/ExtractStaticMetadataCommand.php#L135-L149).

### Méthode retenue

1. Lire la première frame racine ; séparer son objet nommé `cercle` des autres objets, sans perdre profondeur, matrices ni coordonnées Flash.
2. Exporter un asset statique pour le dessin de chaque fichier et un asset circulaire commun placé derrière. Conserver les bounds et l'origine utilisés pour l'ancrage sur la cellule ; ne pas centrer chaque couche indépendamment.
3. Teinter seulement l'asset circulaire avec la couleur du combat. Conserver les formes, contours et images intégrés du graphisme supérieur.
4. Compiler les SVG avec le compilateur statique `.dofasset` existant, sans les faire passer par les animations de personnages. Vérifier le rendu des deux couches réunies et les dimensions natives avant livraison.

### Entrées techniques existantes

- Lecture : `Arakne\Swf\SwfFile` et `Arakne\Swf\Extractor\SwfExtractor`, autoload `tools/assets-exporter/vendor/autoload.php`.
- Séparation des couches : `Arakne\Swf\Extractor\Timeline\Frame`, constructeur `Frame($bounds, $objects, $actions = [], $label = null)` ; constituer deux ensembles d'objets en conservant les bounds racine.
- Conversion : `Arakne\Swf\Extractor\Drawer\Converter\Converter`, `new Converter(subpixelStrokeWidth: false)`, méthode `toSvg(DrawableInterface $drawable, int $frame = 0): string`. Implémentation installée : `tools/assets-exporter/vendor/arakne/swf/src/Extractor/Drawer/Converter/Converter.php`.
- Exemple dans le dépôt : [App\Command\ExtractStaticCommand::extractStaticSvg, lignes 113–128](../../tools/assets-exporter/src/Command/ExtractStaticCommand.php#L113-L128), entrée CLI `tools/assets-exporter/bin/extract-static`.
- Compilation : [compileStatic, packages/dofasset-format/src/static-compile.ts:64](../../packages/dofasset-format/src/static-compile.ts#L64), réexporté par [@dofus/dofasset-format/pipeline](../../packages/dofasset-format/src/pipeline.ts#L8-L12). Signature `compileStatic(svgContent, { assetId, extras?, metadata?, tintMode?, animationName? })` ; résultat `{ bytes, stats }`, animation par défaut `static`, une frame.

## Vérifications attendues

Vérifier sur deux sessions les marqueurs du même combat pendant le placement, le survol et l'entrée d'un allié, les refus camp complet/verrouillé, puis leur disparition au lancement. Vérifier un défi avec ses deux épées. Entrer tardivement comme spectateur depuis la liste et contrôler timeline, tour courant, points de vie, effets, invisibles et pièges cachés. Essayer les commandes de combattant en spectateur, quitter, revenir, activer le blocage depuis le combat, puis terminer le combat. Dans chaque cas, contrôler retour sur la carte, absence de récompenses et absence de marqueurs ou observateurs résiduels.
