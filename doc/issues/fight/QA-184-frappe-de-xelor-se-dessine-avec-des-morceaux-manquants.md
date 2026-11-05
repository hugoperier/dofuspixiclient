---
id: QA-184
title: Frappe de Xélor se dessine avec des morceaux manquants
severity: P2
domain: fight
type: bug
status: fixed
session: 1
opened: 2026-11-04
closed:
fixed_in:
related: [QA-168]
files:
  - ../vello-dofasset-format/packages/vello-wasm/src/lib.rs:1354
  - ../vello-dofasset-format/packages/vello-wasm/Cargo.toml
  - apps/electrobun/src/game/render/spell-vello-renderer.ts:156
---

## Symptôme

Frappe de Xélor (sort 91, visuel 513) se joue avec des morceaux manquants : le
poing et les bandelettes n'apparaissent qu'en partie. Les sources sont
complètes : rendus avec `rsvg-convert`, `shoot_60`, `shoot_125` et `shoot_220`
montrent le poing, les anneaux et les débris. `animation-audit-all.json` compte
264 images pour `shoot`, sans symbole manquant. Zoom de la session :
`Texture-swap zoom: 1.7428…` (`client.log`), qui sert aussi de résolution de
rastérisation des sorts.

## Attendu (1.29)

Le poing bandé sort du sol sous la cible, les anneaux tombent, les débris
rebondissent.

## Cause

`renderAnimationStrip` (`vello-wasm/src/lib.rs:1354`) composait toutes les
images d'une animation dans une seule scène Vello, rendue en un seul dispatch.
Vello 0.8 dimensionne ses tampons GPU avec des constantes figées
(`vello_encoding/src/config.rs:394-404`, « hand picked … should instead get
derived »). Hors feature `debug_layers`, il ne signale jamais un débordement :
ce qui ne tient pas n'est simplement pas dessiné.

Le tampon qui sature est la liste de commandes par tuile, `ptcl` (2²³ mots).
`coarse.wgsl:68-84` y réserve d'abord 64 mots (`PTCL_INITIAL_ALLOC`) pour
**chaque tuile 16×16 de la cible de rendu**, puis distribue des blocs de 256
mots aux tuiles dont les commandes débordent ; un remplissage coûte 4 mots. La
bande de 513/`shoot` à la résolution 1,74 est une cible de 16 120×2 310 px :
146 k tuiles, soit 9,35 M mots de réserve statique pour un tampon de 8,39 M.
Confirmé par le drapeau `failed` que Vello relit en mode robuste :
`STAGE_COARSE` (0x10), le seul étage à échouer.

Reproduit en natif (wgpu/Metal), avec le même code de composition que la
bande, en comparant chaque cellule au rendu isolé de la même image :

| 513/`shoot`, résolution | Dispatchs | Pixels perdus |
| --- | --- | --- |
| 1 | 1 (cible 16 376×663, 2,75 M mots) | 0 % |
| 1,74 | 1 (cible 16 120×2 310) | **100 %** (246 images vides sur 264) |
| 1,74 | 2 (3 lignes de grille par dispatch) | **31,8 %** : des morceaux manquants |
| 1,74 | 3 (2 lignes par dispatch) | 0 % |

C'est pourquoi le symptôme dépend du zoom : la résolution de rastérisation
suit le zoom (`spell-asset-loader.setResolution`). Les débris restaient
visibles parce que `pierres` est une autre bande, toute petite. D'autres
visuels lourds sont touchés de la même façon : 1009/`sprite_21` et
705/`sprite_9` perdent 100 % à 1,74 ; 512/`sprite_42` (Horloge) à partir de
3,5.

## Correctif

`render_animation_strip` rend désormais des lots contigus d'images, un
dispatch chacun, puis copie chaque cellule à sa place dans la bande ; l'API JS
ne change pas. Un lot tient sur une seule ligne de grille, de sorte que la
cible de rendu se réduit exactement à ses cellules. Il est fermé dès que l'une
de ses charges atteint son budget :

- `ptcl` : `tuiles de cellule × (64 + 8 + 4·n_paths + 4·n_clips)` mots, chaque
  chemin compté sur toute sa cellule (un majorant), gardé sous 6 M mots, soit
  72 % du tampon ;
- segments et lignes : l'estimation conservatrice de Vello
  (`Scene::bump_estimate`, feature `bump_estimate`), gardée sous la capacité.

Une image plus lourde que le budget à elle seule forme son propre lot. Le
découpage (`dofasset_renderer::strip::strip_batches`) est testé à part.

## Reste à faire

- Au zoom maximal (×5, résolution 8,7), beaucoup de bandes dépassent
  16 384 px et `renderAnimationStrip` renvoie `NULL` : le visuel ne s'affiche
  pas du tout. 513 dès 5,2, 705 et 1009 dès 3,5. C'est un défaut antérieur, non
  traité ici : il faudrait répartir la bande sur plusieurs textures.
- `flushFrames` et le rendu des masques de zone composent aussi plusieurs
  images par dispatch, sans ce budget.

## Vérification

- `cargo test --lib strip` (`packages/renderer`) : 6 tests.
- Sonde native (lots tels que livrés, comparaison cellule par cellule avec le
  rendu isolé) : **0 % de pixels perdus et 0 px de débordement** sur 513, 512,
  705, 1009, 701, 315, 2917 et 1002, aux résolutions 1 ; 1,74 ; 2,5 ; 3,5 et
  5,2, partout où la bande tient dans 16 384 px. Frappe à 1,74 : 7 dispatchs.
- En jeu : `just wasm`, recharger le client, lancer Frappe au zoom minimal puis
  maximal. Le poing bandé doit apparaître en entier.
