# Couverture des sorts des douze classes Retro

264 sorts de classe (252 sorts de tableaux et douze spéciaux), 1 584 rangs racines. Les sorts communs, maîtrises, armes et acquisition des spéciaux sont hors périmètre.

Le graphe exact comprend **1883 rangs** et **222 grades d'invocation**. Résolution commune avec le serveur et le grimoire : `prepareCombatData`.

Tests : **2273 pass 0 fail**. L'exécution contrôlée normale/critique et les interactions ont des tests distincts. La présence d'un handler et d'un asset ne certifie pas à elle seule la conformité mécanique ni le rendu.

Les preuves navigateur sont séparées et restent à produire pour les 264 sorts. Aucune ligne ci-dessous n'est certifiée visuellement par cet audit. Voir [règles et sources](retro-rules.md).
Les tables compilées et les appels des modules sont contrôlés séparément des pixels affichés : [audit des 145 graphiques](animation-audit.json), [vérification des régressions](regression-validation.md). Un symbole absent est un échec même si la timeline atteint sa fin.

## Féca

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1901 — Invocation de Dopeul Féca | 1, 2, 3, 4, 5, 6 | 2:1, 4:1, 3:1, 16:1, 2:2, 4:2, 3:2, 16:2, 2:3, 4:3, 3:3, 16:3, 2:4, 4:4, 3:4, 16:4, 2:5, 4:5, 3:5, 16:5, 2:6, 4:6, 3:6, 16:6 / 955:1, 955:2, 955:3, 955:4, 955:5, 955:6 | Normale/critique testées | spells/102: Error: Symboles absents : lib_sprite14, lib_sprite15, lib_sprite16, lib_sprite7, lib_sprite9 | Non vérifiée |
| 13 — Glyphe de Silence | 1, 2, 3, 4, 5, 6 | 908:1, 908:2, 908:3, 908:4, 908:5, 908:6 / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 15 — Glyphe d'Immobilisation | 1, 2, 3, 4, 5, 6 | 907:1, 907:2, 907:3, 907:4, 907:5, 907:6 / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 7 — Bouclier Féca | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 10 — Glyphe Enflammé | 1, 2, 3, 4, 5, 6 | 351:1, 351:2, 351:3, 351:4, 351:5, 351:6 / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 11 — Téléportation | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 12 — Glyphe d'Aveuglement | 1, 2, 3, 4, 5, 6 | 1505:1, 1505:2, 1505:3, 1505:4, 1505:5, 1505:6 / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 8 — Retour du bâton | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 16 — Science du bâton | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 5 — Trêve | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 19 — Bulle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/112: Error: Symboles absents : lib_sprite5 | Non vérifiée |
| 14 — Armure Venteuse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/109: Error: Symboles absents : lib_sprite14, lib_sprite15 | Non vérifiée |
| 20 — Immunité | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/105: Error: Symboles absents : lib_sprite7, lib_sprite9 | Non vérifiée |
| 18 — Armure Aqueuse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/104: Error: Symboles absents : lib_sprite5, lib_sprite7 | Non vérifiée |
| 9 — Attaque Nuageuse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 1 — Armure Incandescente | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 2 — Aveuglement | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/102: Error: Symboles absents : lib_sprite14, lib_sprite15, lib_sprite16, lib_sprite7, lib_sprite9 | Non vérifiée |
| 4 — Renvoi de Sort | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 17 — Glyphe Agressif | 1, 2, 3, 4, 5, 6 | 1503:1, 1503:2, 1503:3, 1503:4, 1503:5, 1503:6 / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 3 — Attaque Naturelle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 6 — Armure Terrestre | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 422 — Mise en garde | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |

## Osamodas

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1902 — Invocation de Dopeul Osamodas | 1, 2, 3, 4, 5, 6 | 24:1, 29:1, 23:1, 22:1, 24:2, 29:2, 23:2, 22:2, 24:3, 29:3, 23:3, 22:3, 24:4, 29:4, 23:5, 22:4, 24:5, 29:5, 22:5, 23:6, 22:6, 29:6, 24:6 / 2609:1, 2609:2, 2609:3, 2609:4, 2609:5, 2609:6 | Normale/critique testées | spells/202: Error: Symboles absents : lib_sprite11 | Non vérifiée |
| 31 — Invocation de Dragonnet Rouge | 1, 2, 3, 4, 5, 6 | 477:1, 479:1, 477:2, 479:2, 477:3, 479:3, 477:4, 479:4, 477:5, 479:5, 477:6, 479:6 / 239:1, 239:2, 239:3, 239:4, 239:5, 239:6 | Normale/critique testées | 3 graphiques et 1 sprites contrôlés | Non vérifiée |
| 40 — Invocation de Craqueleur | 1, 2, 3, 4, 5, 6 | 2005:1, 2005:2, 2005:3, 2005:4, 2005:5, 2005:6 / 37:1, 37:2, 37:3, 37:4, 37:5, 37:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés | Non vérifiée |
| 39 — Invocation de Bwork Mage | 1, 2, 3, 4, 5, 6 | 2004:1, 2003:1, 2004:2, 2003:2, 2004:3, 2003:3, 2004:4, 2003:4, 2004:5, 2003:5, 2004:6, 2003:6 / 44:1, 44:2, 44:3, 44:4, 44:5, 44:6 | Normale/critique testées | spells/808: Error: Symboles absents : lib_sprite15 | Non vérifiée |
| 29 — Crocs du Mulou | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 32 — Résistance Naturelle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/214: Error: Symboles absents : lib_sprite13, lib_sprite3 | Non vérifiée |
| 36 — Frappe du Craqueleur | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 38 — Invocation de Sanglier | 1, 2, 3, 4, 5, 6 | 2002:1, 2002:2, 2002:3, 2002:4, 2002:5, 2002:6 / 40:1, 40:2, 40:3, 40:4, 40:5, 40:6 | Normale/critique testées | spells/804: Error: Symboles absents : lib_sprite10, lib_sprite11 | Non vérifiée |
| 25 — Soin Animal | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 33 — Griffe Cinglante | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 24 — Corbeau | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 27 — Piqûre Motivante | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/205: Error: Symboles absents : lib_sprite14, lib_sprite15 | Non vérifiée |
| 30 — Fouet | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 37 — Invocation de Prespic | 1, 2, 3, 4, 5, 6 | 203:1, 82:1, 203:2, 82:2, 203:3, 82:3, 203:4, 82:4, 203:5, 82:5, 203:6, 82:6 / 41:1, 41:2, 41:3, 41:4, 41:5, 41:6 | Normale/critique testées | spells/102: Error: Symboles absents : lib_sprite14, lib_sprite15, lib_sprite16, lib_sprite7, lib_sprite9; spells/504: Error: Symboles absents : lib_sprite10, lib_sprite13, lib_sprite14, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 28 — Crapaud | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 35 — Invocation de Bouftou | 1, 2, 3, 4, 5, 6 | 1709:1, 2000:1, 1709:2, 2000:2, 1709:3, 2000:3, 1709:4, 2000:4, 1709:5, 2000:5, 1709:6, 2000:6 / 36:1, 36:2, 36:3, 36:4, 36:5, 36:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés | Non vérifiée |
| 22 — Déplacement Félin | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 26 — Bénédiction Animale | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/213: Error: Symboles absents : lib_sprite10, lib_sprite11, lib_sprite12, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 34 — Invocation de Tofu | 1, 2, 3, 4, 5, 6 | 1999:1, 1999:2, 1999:3, 1999:4, 1999:5, 1999:6 / 43:1, 43:2, 43:3, 43:4, 43:5, 43:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés | Non vérifiée |
| 21 — Griffe Spectrale | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 23 — Cri de l'Ours | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/202: Error: Symboles absents : lib_sprite11 | Non vérifiée |
| 420 — Laisse Spirituelle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |

## Enutrof

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1903 — Invocation de Dopeul Enutrof | 1, 2, 3, 4, 5, 6 | 51:1, 54:1, 52:1, 55:1, 51:2, 54:2, 52:2, 55:2, 51:3, 54:3, 52:3, 55:3, 51:4, 54:4, 52:4, 55:4, 51:5, 54:5, 52:5, 55:5, 51:6, 54:6, 55:6, 52:6 / 957:1, 957:2, 957:3, 957:4, 957:5, 957:6 | Normale/critique testées | spells/306: Error: Symboles absents : lib_sprite5; spells/312: Error: Symboles absents : lib_sprite4, lib_sprite7, lib_sprite8; spells/314: Error: Symboles absents : lib_sprite18, lib_sprite19 | Non vérifiée |
| 60 — Coffre Animé | 1, 2, 3, 4, 5, 6 | 495:1, 495:2, 495:3, 495:4, 495:5, 495:6 / 285:1, 285:2, 285:3, 285:4, 285:5, 285:6 | Normale/critique testées | 0 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 57 — Pelle Animée | 1, 2, 3, 4, 5, 6 | 310:1, 310:2, 310:3, 310:4, 310:5, 310:6 / 238:1, 238:2, 238:3, 238:4, 238:5, 238:6 | Normale/critique testées | spells/301: Error: Symboles absents : lib_sprite23, lib_sprite24, lib_sprite3, lib_sprite4 | Non vérifiée |
| 59 — Corruption | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 58 — Pelle Massacrante | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/313: Error: Symboles absents : lib_sprite12, lib_sprite7 | Non vérifiée |
| 56 — Pelle du Jugement | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 55 — Accélération | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 54 — Maladresse de Masse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/312: Error: Symboles absents : lib_sprite4, lib_sprite7, lib_sprite8 | Non vérifiée |
| 50 — Maladresse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 44 — Roulage de Pelle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/305: Error: Symboles absents : lib_sprite27 | Non vérifiée |
| 52 — Cupidité | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/314: Error: Symboles absents : lib_sprite18, lib_sprite19 | Non vérifiée |
| 46 — Désinvocation | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 53 — Force de l'Age | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 45 — Clé Réductrice | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/311: Error: Symboles absents : lib_sprite4, lib_sprite9 | Non vérifiée |
| 48 — Remblai | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/317: Error: Symboles absents : lib_sprite14 | Non vérifiée |
| 47 — Boîte de Pandore | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/301: Error: Symboles absents : lib_sprite23, lib_sprite24, lib_sprite3, lib_sprite4 | Non vérifiée |
| 42 — Chance | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/301: Error: Symboles absents : lib_sprite23, lib_sprite24, lib_sprite3, lib_sprite4 | Non vérifiée |
| 49 — Pelle Fantomatique | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 41 — Sac Animé | 1, 2, 3, 4, 5, 6 | 440:1, 440:2, 440:3, 440:4, 440:5, 440:6 / 237:1, 237:2, 237:3, 237:4, 237:5, 237:6 | Normale/critique testées | 2 graphiques et 1 sprites contrôlés | Non vérifiée |
| 51 — Lancer de Pièces | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/306: Error: Symboles absents : lib_sprite5 | Non vérifiée |
| 43 — Lancer de Pelle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/310: Error: Symboles absents : lib_sprite18 | Non vérifiée |
| 425 — Retraite anticipée | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |

## Sram

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1904 — Invocation de Dopeul Sram | 1, 2, 3, 4, 5, 6 | 64:1, 65:1, 68:1, 62:1, 2007:1, 64:2, 65:2, 68:2, 62:2, 2007:2, 64:3, 65:3, 68:3, 62:3, 2007:3, 64:4, 65:4, 68:4, 62:4, 2007:4, 64:5, 65:5, 68:5, 62:5, 2007:5, 64:6, 65:6, 68:6, 62:6, 2007:6 / 958:1, 958:2, 958:3, 958:4, 958:5, 958:6 | Normale/critique testées | 2 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 80 — Piège Mortel | 1, 2, 3, 4, 5, 6 | 1499:1, 1499:2, 1499:3, 1499:4, 1499:5, 1499:6 / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 76 — Attaque Mortelle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/412: Error: Symboles absents : lib_sprite3 | Non vérifiée |
| 75 — Pulsion de Chakra | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 70 — Arnaque | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/406: Error: Symboles absents : lib_sprite21, lib_sprite6 | Non vérifiée |
| 67 — Peur | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/403: Error: Symboles absents : lib_sprite6, lib_sprite7 | Non vérifiée |
| 73 — Piège répulsif | 1, 2, 3, 4, 5, 6 | 1688:1 / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 77 — Piège de Silence | 1, 2, 3, 4, 5, 6 | 1497:1, 1497:2, 1497:3, 1497:4, 1497:5, 1497:6 / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 69 — Piège d'Immobilisation | 1, 2, 3, 4, 5, 6 | 909:3, 909:4, 909:5, 909:6 / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 62 — Concentration de Chakra | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 71 — Piège Empoisonné | 1, 2, 3, 4, 5, 6 | 1495:1, 1495:2, 1495:3, 1495:4, 1495:5, 1495:6 / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 78 — Invisibilité d'Autrui | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 79 — Piège de Masse | 1, 2, 3, 4, 5, 6 | 1493:1, 1493:2, 1493:3, 1493:4, 1493:5, 1493:6 / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 64 — Repérage | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 74 — Double | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 2 sprites contrôlés | Non vérifiée |
| 63 — Coup Sournois | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/403: Error: Symboles absents : lib_sprite6, lib_sprite7 | Non vérifiée |
| 68 — Fourvoiement | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 66 — Poison insidieux | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/405: Error: Symboles absents : lib_sprite18 | Non vérifiée |
| 65 — Piège Sournois | 1, 2, 3, 4, 5, 6 | 2007:1, 2007:2, 2007:3, 2007:4, 2007:5, 2007:6 / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 61 — Sournoiserie | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/405: Error: Symboles absents : lib_sprite18 | Non vérifiée |
| 72 — Invisibilité | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 416 — Poisse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |

## Xélor

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1905 — Invocation de Dopeul Xélor | 1, 2, 3, 4, 5, 6 | 94:1, 87:1, 97:1, 83:1, 589:1, 590:1, 87:2, 83:2, 97:2, 94:2, 589:2, 590:2, 87:3, 83:3, 97:3, 94:3, 589:3, 590:3, 87:4, 83:4, 97:4, 94:4, 589:4, 590:4, 87:5, 83:5, 97:5, 94:5, 589:5, 590:5, 87:6, 83:6, 97:6, 94:6, 589:6, 590:6 / 959:1, 264:1, 959:2, 264:2, 959:3, 264:3, 959:4, 264:4, 959:5, 264:5, 959:6, 264:6 | Normale/critique testées | spells/503: Error: Symboles absents : lib_sprite12, lib_sprite5; spells/504: Error: Symboles absents : lib_sprite10, lib_sprite13, lib_sprite14, lib_sprite3, lib_sprite4, lib_sprite9; spells/510: Error: Symboles absents : lib_sprite6, lib_sprite7, lib_sprite8; spells/504: Error: Symboles absents : lib_sprite10, lib_sprite13, lib_sprite14, lib_sprite3, lib_sprite4, lib_sprite9; spells/510: Error: Symboles absents : lib_sprite6, lib_sprite7, lib_sprite8; spells/503: Error: Symboles absents : lib_sprite12, lib_sprite5 | Non vérifiée |
| 97 — Cadran de Xélor | 1, 2, 3, 4, 5, 6 | 589:1, 590:1, 589:2, 590:2, 589:3, 590:3, 589:4, 590:4, 589:5, 590:5, 589:6, 590:6 / 264:1, 264:2, 264:3, 264:4, 264:5, 264:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés | Non vérifiée |
| 91 — Frappe de Xélor | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/513: Error: Symboles absents : lib_sprite60 | Non vérifiée |
| 95 — Horloge | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 99 — Momification | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 1 sprites contrôlés | Non vérifiée |
| 94 — Protection Aveuglante | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/503: Error: Symboles absents : lib_sprite12, lib_sprite5 | Non vérifiée |
| 87 — Démotivation | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/504: Error: Symboles absents : lib_sprite10, lib_sprite13, lib_sprite14, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 90 — Fuite | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/504: Error: Symboles absents : lib_sprite10, lib_sprite13, lib_sprite14, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 89 — Dévouement | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/511: Error: Symboles absents : lib_sprite8 | Non vérifiée |
| 86 — Aiguille Chercheuse | 1, 2, 3, 4, 5, 6 | 315:1, 315:2, 315:3, 315:4, 315:5, 315:6 / 250:1, 250:2, 250:3, 250:4, 250:5, 250:6 | Normale/critique testées | 0 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 98 — Vol du Temps | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/507: Error: Symboles absents : lib_or, lib_pierres, lib_sprite13, lib_sprite15, lib_terre | Non vérifiée |
| 96 — Poussière Temporelle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/507: Error: Symboles absents : lib_or, lib_pierres, lib_sprite13, lib_sprite15, lib_terre | Non vérifiée |
| 85 — Flou | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/503: Error: Symboles absents : lib_sprite12, lib_sprite5 | Non vérifiée |
| 93 — Flétrissement | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/805: Error: Symboles absents : lib_sprite4, lib_sprite6 | Non vérifiée |
| 88 — Téléportation | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 92 — Rayon Obscur | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/805: Error: Symboles absents : lib_sprite4, lib_sprite6 | Non vérifiée |
| 100 — Sablier de Xélor | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 84 — Gelure | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/501: Error: Symboles absents : lib_sprite7 | Non vérifiée |
| 82 — Contre | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/504: Error: Symboles absents : lib_sprite10, lib_sprite13, lib_sprite14, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 83 — Aiguille | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/510: Error: Symboles absents : lib_sprite6, lib_sprite7, lib_sprite8 | Non vérifiée |
| 81 — Ralentissement | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/503: Error: Symboles absents : lib_sprite12, lib_sprite5 | Non vérifiée |
| 424 — Raulebaque | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |

## Ecaflip

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1906 — Invocation de Dopeul Ecaflip | 1, 2, 3, 4, 5, 6 | 109:1, 101:1, 106:1, 118:1, 109:2, 101:2, 106:2, 118:2, 109:3, 101:3, 106:3, 118:3, 109:4, 101:4, 106:4, 118:4, 109:5, 101:5, 106:5, 118:5, 109:6, 101:6, 106:6, 118:6 / 960:1, 960:2, 960:3, 960:4, 960:5, 960:6 | Normale/critique testées | spells/611: Error: Symboles absents : lib_sprite9; spells/602: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9; spells/603: Error: Symboles absents : lib_sprite18, lib_sprite19, lib_sprite3, lib_sprite4; spells/614: Error: Symboles absents : lib_sprite10, lib_sprite8, lib_sprite9 | Non vérifiée |
| 120 — Destin d'Ecaflip | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 114 — Rekop | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/616: Error: Symboles absents : lib_sprite30, lib_sprite31, lib_sprite32 | Non vérifiée |
| 112 — Griffe de Ceangal | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/615: Error: Symboles absents : lib_sprite9 | Non vérifiée |
| 110 — Griffe Joueuse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/604: Error: Symboles absents : lib_sprite18, lib_sprite19, lib_sprite20, lib_sprite24, lib_sprite25 | Non vérifiée |
| 118 — Réflexes | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/614: Error: Symboles absents : lib_sprite10, lib_sprite8, lib_sprite9 | Non vérifiée |
| 115 — Odorat | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 108 — Esprit Félin | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 117 — Griffe Invocatrice | 1, 2, 3, 4, 5, 6 | 487:1, 209:1, 487:2, 209:2, 487:3, 209:3, 487:4, 209:4, 487:5, 209:5, 487:6, 209:6 / 45:1, 45:2, 45:3, 45:4, 45:5, 45:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés | Non vérifiée |
| 106 — Roue de la Fortune | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/603: Error: Symboles absents : lib_sprite18, lib_sprite19, lib_sprite3, lib_sprite4 | Non vérifiée |
| 116 — Langue Râpeuse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 107 — Topkaj | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/612: Error: Symboles absents : lib_sprite36, lib_sprite37, lib_sprite38 | Non vérifiée |
| 101 — Roulette | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/602: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 119 — Tout ou rien | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/613: Error: Symboles absents : lib_sprite6, lib_sprite7 | Non vérifiée |
| 104 — Trèfle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/605: Error: Symboles absents : lib_sprite21 | Non vérifiée |
| 111 — Contrecoup | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/603: Error: Symboles absents : lib_sprite18, lib_sprite19, lib_sprite3, lib_sprite4 | Non vérifiée |
| 113 — Perception | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 109 — Bluff | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/611: Error: Symboles absents : lib_sprite9 | Non vérifiée |
| 102 — Pile ou Face | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/601: Error: Symboles absents : lib_sprite10 | Non vérifiée |
| 105 — Bond du Félin | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 103 — Chance d'Ecaflip | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/603: Error: Symboles absents : lib_sprite18, lib_sprite19, lib_sprite3, lib_sprite4 | Non vérifiée |
| 412 — Félintion | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |

## Eniripsa

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1907 — Invocation de Dopeul Eniripsa | 1, 2, 3, 4, 5, 6 | 122:1, 2021:1, 128:1, 132:1, 122:2, 2021:2, 128:2, 132:2, 122:3, 2021:3, 128:3, 132:3, 122:4, 2021:4, 128:4, 132:4, 122:5, 2021:5, 128:5, 132:5, 122:6, 128:6, 132:6, 2021:6 / 961:1, 961:2, 961:3, 961:4, 961:5, 961:6 | Normale/critique testées | 3 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 140 — Mot de Reconstitution | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/702: Error: Symboles absents : lib_sprite11 | Non vérifiée |
| 139 — Mot d'Altruisme | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/710: Error: Symboles absents : lib_sprite17, lib_sprite23 | Non vérifiée |
| 138 — Mot de Silence | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/711: Error: Symboles absents : lib_sprite23, lib_sprite28, lib_sprite29, lib_sprite5 | Non vérifiée |
| 137 — Mot d'Envol | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 136 — Mot d'Immobilisation | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/803: Error: Symboles absents : lib_sprite8 | Non vérifiée |
| 129 — Mot d'Amitié | 1, 2, 3, 4, 5, 6 | 210:1, 582:1, 582:2, 210:2, 210:3, 582:3, 210:4, 582:4, 582:5, 210:5, 582:6, 210:6 / 39:1, 39:2, 39:3, 39:4, 39:5, 39:6 | Normale/critique testées | spells/702: Error: Symboles absents : lib_sprite11 | Non vérifiée |
| 135 — Mot de Sacrifice | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/709: Error: Symboles absents : lib_sprite16 | Non vérifiée |
| 134 — Mot Vampirique | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 133 — Mot de Jouvence | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/708: Error: Symboles absents : lib_sprite15, lib_sprite21 | Non vérifiée |
| 132 — Mot d'Epine | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 131 — Mot de Régénération | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/702: Error: Symboles absents : lib_sprite11 | Non vérifiée |
| 130 — Mot Revitalisant | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/703: Error: Symboles absents : lib_sprite7, lib_sprite8 | Non vérifiée |
| 123 — Mot Drainant | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 127 — Mot de Prévention | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 126 — Mot Stimulant | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 122 — Mot Blessant | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 124 — Mot Soignant | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/702: Error: Symboles absents : lib_sprite11 | Non vérifiée |
| 121 — Mot Curatif | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/702: Error: Symboles absents : lib_sprite11 | Non vérifiée |
| 128 — Mot de Frayeur | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 125 — Mot Interdit | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 427 — Mot Lotof | 1, 2, 3, 4, 5, 6 | 1679:1, 1679:2, 1679:3, 1679:4, 1679:5, 1679:6 / — | Normale/critique testées | 0 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |

## Iop

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1908 — Invocation de Dopeul Iop | 1, 2, 3, 4, 5, 6 | 147:1, 153:1, 148:1, 150:1, 147:2, 153:2, 148:2, 150:2, 147:3, 153:3, 148:3, 150:3, 147:4, 153:4, 148:4, 150:4, 147:5, 153:5, 148:5, 150:5, 147:6, 153:6, 148:6, 150:6 / 962:1, 962:2, 962:3, 962:4, 962:5, 962:6 | Normale/critique testées | spells/801: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9; spells/803: Error: Symboles absents : lib_sprite8 | Non vérifiée |
| 159 — Colère de Iop | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/809: Error: Symboles absents : lib_sprite6 | Non vérifiée |
| 160 — Epée de Iop | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/805: Error: Symboles absents : lib_sprite4, lib_sprite6 | Non vérifiée |
| 158 — Concentration | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 157 — Epée Céleste | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/808: Error: Symboles absents : lib_sprite15 | Non vérifiée |
| 156 — Tempête de Puissance | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 149 — Mutilation | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 153 — Puissance | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/803: Error: Symboles absents : lib_sprite8 | Non vérifiée |
| 152 — Epée du Jugement | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/809: Error: Symboles absents : lib_sprite6 | Non vérifiée |
| 155 — Vitalité | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/801: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 151 — Souffle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/804: Error: Symboles absents : lib_sprite10, lib_sprite11 | Non vérifiée |
| 150 — Couper | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 154 — Epée Destructrice | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 148 — Amplification | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/801: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 147 — Guide de Bravoure | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/801: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 146 — Epée du destin | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 145 — Epée Divine | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 144 — Compulsion | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/801: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 143 — Intimidation | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/804: Error: Symboles absents : lib_sprite10, lib_sprite11 | Non vérifiée |
| 141 — Pression | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 142 — Bond | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 410 — Brokle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |

## Crâ

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1909 — Invocation de Dopeul Crâ | 1, 2, 3, 4, 5, 6 | 166:1, 172:1, 173:1, 177:1, 172:2, 166:2, 173:2, 177:2, 166:3, 172:3, 173:3, 177:3, 172:4, 166:4, 173:4, 177:4, 166:6, 172:6, 173:5, 177:5, 173:6, 177:6 / 963:1, 963:2, 963:3, 963:4, 963:5, 963:6 | Normale/critique testées | spells/904: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9; spells/901: Error: Symboles absents : lib_sprite8 | Non vérifiée |
| 180 — Maîtrise de l'Arc | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/907: Error: Symboles absents : lib_sprite10, lib_sprite13, lib_sprite14, lib_sprite3, lib_sprite4 | Non vérifiée |
| 179 — Flèche Explosive | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 177 — Flèche Ralentissante | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 178 — Flèche Absorbante | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/906: Error: Symboles absents : lib_sprite18, lib_sprite19 | Non vérifiée |
| 175 — Flèche Destructrice | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 176 — Flèche Persécutrice | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1054: Error: Symboles absents : lib_sprite16, lib_sprite17, lib_sprite18, lib_sprite19, lib_sprite20, lib_sprite21, lib_sprite4, lib_sprite5 | Non vérifiée |
| 174 — Flèche Cinglante | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/903: Error: Symboles absents : lib_sprite7, lib_sprite8 | Non vérifiée |
| 173 — Flèche Harcelante | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/901: Error: Symboles absents : lib_sprite8 | Non vérifiée |
| 166 — Tir Puissant | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/904: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 171 — Flèche Punitive | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/912: Error: Symboles absents : lib_sprite27 | Non vérifiée |
| 170 — Flèche d'Immobilisation | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/901: Error: Symboles absents : lib_sprite8 | Non vérifiée |
| 162 — Tir Critique | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/904: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 168 — Oeil de Taupe | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 167 — Flèche d'Expiation | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/902: Error: Symboles absents : lib_sprite6 | Non vérifiée |
| 172 — Tir Eloigné | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/904: Error: Symboles absents : lib_sprite10, lib_sprite12, lib_sprite13, lib_sprite3, lib_sprite4, lib_sprite9 | Non vérifiée |
| 165 — Flèche Enflammée | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 163 — Flèche Glacée | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 161 — Flèche Magique | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/902: Error: Symboles absents : lib_sprite6 | Non vérifiée |
| 164 — Flèche Empoisonnée | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/901: Error: Symboles absents : lib_sprite8 | Non vérifiée |
| 169 — Flèche de Recul | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/804: Error: Symboles absents : lib_sprite10, lib_sprite11 | Non vérifiée |
| 418 — Flèche de dispersion | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |

## Sadida

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1910 — Invocation de Dopeul Sadida | 1, 2, 3, 4, 5, 6 | 199:1, 182:1, 193:1, 183:1, 1510:1, 199:2, 193:2, 182:2, 183:2, 1510:2, 199:3, 182:3, 193:3, 183:3, 1510:3, 199:4, 182:4, 193:4, 183:4, 1510:4, 199:5, 182:5, 193:5, 183:5, 1510:5, 193:6, 199:6, 182:6, 183:6, 1510:6 / 964:1, 114:1, 115:1, 964:2, 115:2, 114:2, 964:3, 114:3, 115:3, 964:4, 114:4, 115:4, 964:5, 114:5, 115:5, 964:6, 115:6, 114:6 | Normale/critique testées | spells/1008: Error: Symboles absents : lib_sprite21 | Non vérifiée |
| 187 — La Surpuissante | 1, 2, 3, 4, 5, 6 | 266:1, 919:1, 1511:1, 997:1, 266:2, 919:2, 1511:2, 997:2, 266:3, 919:3, 1511:3, 997:3, 266:4, 919:4, 1511:4, 997:4, 266:5, 919:5, 1511:5, 997:5, 266:6, 919:6, 1511:6, 997:6 / 42:1, 152:1, 42:2, 152:2, 42:3, 152:3, 42:4, 152:4, 42:5, 152:5, 42:6, 152:6 | Normale/critique testées | 2 graphiques et 2 sprites contrôlés | Non vérifiée |
| 188 — Ronce Insolente | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 184 — Feu de Brousse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1013: Error: Symboles absents : lib_sprite14 | Non vérifiée |
| 185 — Herbe Folle | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 194 — Ronces Agressives | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 190 — La Gonflable | 1, 2, 3, 4, 5, 6 | 284:1, 587:1, 284:2, 587:2, 284:3, 587:3, 284:4, 587:4, 284:5, 587:5, 284:6, 587:6 / 117:1, 117:2, 117:3, 117:4, 117:5, 117:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés | Non vérifiée |
| 196 — Vent Empoisonné | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 186 — Arbre | 1, 2, 3, 4, 5, 6 | — / 282:1, 282:2, 282:3, 282:4, 282:5, 282:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés | Non vérifiée |
| 191 — Ronces Multiples | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 199 — Connaissance des Poupées | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1008: Error: Symboles absents : lib_sprite21 | Non vérifiée |
| 181 — Tremblement | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1003: Error: Symboles absents : lib_sprite6 | Non vérifiée |
| 189 — La Sacrifiée | 1, 2, 3, 4, 5, 6 | 233:1, 233:2, 233:3, 233:4, 233:5, 233:6 / 116:1, 116:2, 116:3, 116:4, 116:5, 116:6 | Normale/critique testées | spells/1202: Error: Symboles absents : lib_sprite46, lib_sprite47 | Non vérifiée |
| 197 — Puissance Sylvestre | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 192 — Ronce Apaisante | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 182 — La Folle | 1, 2, 3, 4, 5, 6 | 1510:1, 1510:2, 1510:3, 1510:4, 1510:5, 1510:6 / 114:1, 114:2, 114:3, 114:4, 114:5, 114:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés | Non vérifiée |
| 195 — Larme | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 198 — Sacrifice Poupesque | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 200 — Poison Paralysant | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 193 — La Bloqueuse | 1, 2, 3, 4, 5, 6 | — / 115:1, 115:2, 115:3, 115:4, 115:5, 115:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés | Non vérifiée |
| 183 — Ronce | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 426 — Arbre de vie | 1, 2, 3, 4, 5, 6 | 1687:1, 1687:2, 1687:3, 1687:4, 1687:5, 1687:6 / 2750:1, 2750:2, 2750:3, 2750:4, 2750:5, 2750:6 | Normale/critique testées | 0 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |

## Sacrieur

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1911 — Invocation de Dopeul Sacrieur | 1, 2, 3, 4, 5, 6 | 432:1, 434:1, 442:1, 437:1, 432:2, 434:2, 442:2, 437:2, 432:3, 434:3, 442:3, 437:3, 432:4, 434:4, 442:4, 437:4, 432:5, 434:5, 442:5, 437:5, 432:6, 434:6, 442:6, 437:6 / 2608:1, 2608:2, 2608:3, 2608:4, 2608:5, 2608:6 | Normale/critique testées | spells/1051: Error: Symboles absents : lib_sprite7 | Non vérifiée |
| 450 — Folie sanguinaire | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 435 — Transfert de Vie | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1050: Error: Symboles absents : lib_sprite4 | Non vérifiée |
| 448 — Epée volante | 1, 2, 3, 4, 5, 6 | 486:1, 486:2, 486:3, 486:4, 486:5, 486:6 / 434:1, 434:2, 434:3, 434:4, 434:5, 434:6 | Normale/critique testées | 0 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 447 — Furie | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1054: Error: Symboles absents : lib_sprite16, lib_sprite17, lib_sprite18, lib_sprite19, lib_sprite20, lib_sprite21, lib_sprite4, lib_sprite5 | Non vérifiée |
| 446 — Punition | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 438 — Transposition | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 445 — Coopération | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 441 — Châtiment Vitalesque | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1051: Error: Symboles absents : lib_sprite7 | Non vérifiée |
| 442 — Absorption | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 440 — Sacrifice | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 443 — Châtiment Spirituel | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1051: Error: Symboles absents : lib_sprite7 | Non vérifiée |
| 433 — Châtiment Osé | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1051: Error: Symboles absents : lib_sprite7 | Non vérifiée |
| 439 — Dissolution | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 437 — Châtiment Agile | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1051: Error: Symboles absents : lib_sprite7 | Non vérifiée |
| 436 — Assaut | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 449 — Détour | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 444 — Dérobade | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 432 — Pied du Sacrieur | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 434 — Attirance | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 431 — Châtiment Forcé | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1051: Error: Symboles absents : lib_sprite7 | Non vérifiée |
| 421 — Douleur partagée | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |

## Pandawa

| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |
| --- | --- | --- | --- | --- | --- |
| 1912 — Invocation de Dopeul Pandawa | 1, 2, 3, 4, 5, 6 | 687:1, 1676:1, 1678:1, 1677:1, 687:2, 1676:2, 1678:2, 1677:2, 687:3, 1676:3, 1678:3, 1677:3, 687:4, 1676:4, 1678:4, 1677:4, 687:5, 1676:5, 1678:5, 1677:5, 687:6, 1676:6, 1678:6, 1677:6 / 969:1, 969:2, 969:3, 969:4, 969:5, 969:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 705 — Lien Spiritueux | 1, 2, 3, 4, 5, 6 | 588:1, 1116:1, 544:1, 544:2, 1116:2, 588:2, 544:3, 1116:3, 588:3, 544:4, 1116:4, 588:4, 544:5, 1116:5, 588:5, 544:6, 1116:6, 588:6 / 516:1, 516:2, 516:3, 516:4, 516:5, 516:6 | Normale/critique testées | 0 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 704 — Pandanlku | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 703 — Pandatak | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 702 — Flasque Explosive | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1202: Error: Symboles absents : lib_sprite46, lib_sprite47 | Non vérifiée |
| 701 — Colère de Zatoïshwan | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 700 — Vague à Lame | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 699 — Lait de Bambou | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 698 — Souillure | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1212: Error: Symboles absents : lib_sprite16 | Non vérifiée |
| 697 — Vulnérabilité Terrestre | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 696 — Chamrak | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 695 — Stabilisation | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | spells/1211: Error: Symboles absents : lib_sprite25, lib_sprite26, lib_sprite27 | Non vérifiée |
| 694 — Vulnérabilité Venteuse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 693 — Karcham | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 0 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 688 — Vulnérabilité Incandescente | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 691 — Vulnérabilité Aqueuse | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 690 — Souffle Alcoolisé | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 689 — Epouvante | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 686 — Picole | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 0 graphiques et 2 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
| 692 — Gueule de Bois | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 687 — Poing Enflammé | 1, 2, 3, 4, 5, 6 | — / — | Normale/critique testées | 1 graphiques et 0 sprites contrôlés | Non vérifiée |
| 423 — Ivresse | 1, 2, 3, 4, 5, 6 | 1675:1, 1674:1, 1675:2, 1674:2, 1675:3, 1674:3, 1675:4, 1674:4, 1675:5, 1674:5, 1675:6, 1674:6 / 2727:1, 2727:2, 2727:3, 2727:4, 2727:5, 2727:6 | Normale/critique testées | 1 graphiques et 1 sprites contrôlés; pose / effets synchronisés | Non vérifiée |
