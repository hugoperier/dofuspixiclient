---
id: QA-155
title: Les boîtes de confirmation du craft coopératif ne se ferment jamais et bloquent la fenêtre
severity: P1
domain: exchange
type: bug
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-138, QA-107, QA-135]
files:
  - apps/electrobun/src/hud/exchange/TradeRequestDialog.tsx
  - apps/electrobun/src/hud/craft/CraftWindow.tsx
  - apps/gameserver-ts/src/core/modules/exchange/secure-craft.flow.ts
---

## Symptôme

Deux clients à l'atelier d'Incarnam (10355). `Dev` est Bûcheron, `Mikos` est le
client. `Dev` clique `Mikos` → « Inviter à Scier ».

Le serveur ouvre bien la session :

```
[SecureCraftFlow] secure craft 08f1d228-…: 1 works for 9 (skill 101)
gateway payload: "exchangeCreate"   (×2)
```

Les deux fenêtres coopératives s'ouvrent — « Inventaire du client / Recette /
Paiement / Créer » côté artisan, « Mon inventaire / Recette / Paiement /
L'artisan lancera la fabrication. » côté client.

**Mais les deux boîtes modales restent affichées par-dessus, indéfiniment.**
Dix secondes après l'acceptation, relevé DOM :

- côté `Mikos` : `"Dev te propose de faire un échange.\nAcceptes-tu ?\nOui\nNon"`
- côté `Dev` : « En attente de la réponse de Mikos pour un échange… » + « Annuler »

La modale couvre la moitié gauche : l'artisan n'atteint pas « Créer », le
client n'atteint pas son inventaire. **S06 §3 est injouable.**

## Attendu (1.29)

La demande disparaît des deux côtés dès que `EC` arrive : c'est l'ouverture de
la fenêtre d'échange qui clôt la négociation.

## Cause

`ExchangeHandler.on("exchangeCreate")`, côté client : seule la branche
`EXCHANGE_PLAYER` retirait la demande, via `openTradeWindow()`. Le craft
coopératif ouvre sa fenêtre par un autre chemin et laissait `tradeStore.phase`
sur `asked` / `awaiting-answer` — c'est cet état, et rien d'autre, qui tient la
modale à l'écran.

## Correctif

`EC` ferme la négociation quelle que soit la fenêtre qu'il ouvre.

## Vérification

Deux clients, artisan devant son atelier :

1. « Inviter à *métier* » ; le client accepte ;
2. **les deux boîtes disparaissent** et les deux fenêtres sont utilisables ;
3. le client dépose ses ingrédients, l'artisan clique « Créer » ;
4. l'objet entre chez le **client**, l'expérience va à l'**artisan** (S06 §3).

Puis « Non » côté client : les deux boîtes disparaissent aussi, aucune session
ne reste ouverte.

## Résolution

**La cause était bien côté client, et tient en une ligne manquante.**
`ExchangeHandler.on("exchangeCreate")` n'appelait `closeTrade()` que dans la
branche `EXCHANGE_PLAYER`, à travers `openTradeWindow()`. Tous les autres types
— dont les deux du craft coopératif — ouvraient leur fenêtre en laissant la
demande montée, puisque c'est `tradeStore.phase` qui la tient à l'écran. `EC`
ferme désormais la négociation quelle que soit la fenêtre qu'il ouvre.

Relevé manette en main, deux clients à l'atelier d'Incarnam (10355), `Dev`
Bûcheron et `Mikos` client :

- « Inviter à Scier » → les deux boîtes s'affichent ;
- `Mikos` répond « Oui » → **les deux boîtes disparaissent**, `Mikos` voit
  « Mon inventaire » et son sac, `Dev` voit « Inventaire du client » et
  **« Créer »**. Les deux fenêtres sont utilisables ;
- le client pose 20 Bois de Frêne, l'artisan clique « Créer » →
  « Fabrication réussie. » des deux côtés, la Planche entre chez `Mikos`,
  l'XP de Bûcheron va à `Dev` ;
- refait avec « Non » : **les deux boîtes disparaissent aussi**, « Echange
  annulé » des deux côtés, aucune session ne survit.
