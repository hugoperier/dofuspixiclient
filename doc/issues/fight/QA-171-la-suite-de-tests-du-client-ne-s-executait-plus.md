---
id: QA-171
title: "La suite de tests du client ne s'exécutait plus, laissant passer un test périmé sur les visuels de sorts"
severity: P1
domain: fight
type: test-gap
status: fixed
session: 9
opened: 2026-09-09
closed:
fixed_in:
related: [QA-168, QA-170]
files:
  - apps/electrobun/bunfig.toml
  - apps/electrobun/src/game/assets/spell-asset-loader.spec.ts
  - biome.json
---

## Symptôme

`bun test` lancé depuis `apps/electrobun`, la commande documentée dans
`CLAUDE.md`, sort en code 1 après avoir affiché sa bannière et rien d'autre :
aucun test, aucun compteur, aucune erreur. Le même comportement depuis la
racine du dépôt, mais avec le message qui manquait :

```
error: Cannot read file ".../apps/electrobun": EMFILE
```

La suite était donc muette depuis un moment, et personne ne pouvait voir
qu'un test y échouait.

## Cause

Deux choses distinctes, la première masquant la seconde.

**Le lanceur.** `bun test` parcourt l'arborescence depuis le dossier courant
pour trouver les fichiers de test, `public/assets` compris — 5,8 Go d'assets
publiés. Il épuise les descripteurs de fichiers du processus (`EMFILE`,
`kern.maxfilesperproc` = 61 440 sur cette machine) et s'arrête, sans rien
écrire quand l'erreur survient depuis le dossier de l'app. Se placer dans
`apps/electrobun/src` suffisait à contourner : c'est ce que fait maintenant
la configuration.

**Le test périmé.** `spell-asset-loader.spec.ts` exigeait encore que
`getFrames` lève une exception sur un symbole absent du `.dofasset`.
QA-168 a délibérément supprimé ce comportement — un seul calque de
particules manquant faisait alors échouer *tout* le visuel du sort, et le
joueur ne voyait rien — mais le commit `b17cf52320` n'a touché que
`spell-asset-loader.ts`, jamais son test.

## Correctif

`apps/electrobun/bunfig.toml` restreint le lanceur à `src/`. Aucun test ne
vit ailleurs, et `bun test` depuis `apps/electrobun` repasse : 562 tests.

Le test est réécrit sur le contrat réel : un symbole absent rend une liste
de frames vide, avertit une fois et une seule, et un index de frame hors
bornes d'un symbole bien présent reste une erreur.

`biome.json` cesse par ailleurs d'analyser `dist/` et `build/`, qui ne sont
pas suivis par git. `bun run lint` du serveur annonçait 2 391 erreurs dont
2 333 venaient des deux bundles de `apps/gameserver-ts/dist`, ce qui rendait
le rapport inutilisable.

## Vérification

```bash
cd apps/electrobun && bun test          # 562 tests, 0 échec
cd apps/gameserver-ts && bun test src/  # 2900 tests, 0 échec
```

Reste en dette, hors sujet ici : 58 diagnostics biome réels côté serveur
(surtout l'ordre des imports) et 95 côté client (surtout les accolades
manquantes). Aucun n'est nouveau.
