---
id: QA-159
title: Tout refus de fabrication est silencieux — « Combiner » ne produit rien du tout
severity: P2
domain: exchange
type: gap
status: fixed
session: 8
opened: 2026-09-05
closed:
fixed_in:
related: [QA-135, QA-152, QA-123]
files:
  - apps/gameserver-ts/src/core/features/game/exchange/exchange.handler.ts:364
  - apps/gameserver-ts/src/core/modules/exchange/craft.flow.ts:381
  - apps/gameserver-ts/src/core/modules/harvest/harvest.constants.ts:44
---

## Symptôme

Scie de Bûcheron, 21 Bois de Frêne posés pour une recette qui en demande 20.
Clic sur « Combiner » :

- la sonde client confirme l'émission — `craftOnce()` puis `exchangeSetReady()` ;
- **aucun message** dans la fenêtre ni dans le chat ;
- **aucune ligne** de journal serveur au niveau `LOG` ;
- rien ne bouge en base.

Du point de vue du joueur, le bouton ne fait rien. Il n'a aucun moyen
d'apprendre que la quantité est en cause.

## Attendu

QA-123 pose la règle pour ce chantier : « Tout refus doit terminer l'action et
produire une raison exploitable par le client ; aucune branche ne doit rester
silencieuse. » La récolte la tient — `HARVEST_DENIAL_MESSAGES` porte onze
motifs rédigés — l'artisanat non.

## Cause

`exchange.handler.ts:364` récupère le motif et le jette dans un `debug` :

```ts
const result = await this.exchange.craftOnce(ctx.sessionId);

if (!result.ok) {
  this.logger.debug(`EL refused (${result.reason}) session=${ctx.sessionId}`);
}
```

`CraftFlow` sait pourtant nommer ses refus : `no-bench`, `empty-bench`,
`not-found`, `no-such-recipe`, `invalid-quantity`, `equipped`, `not-enough`,
`no-slot-left`.

## Correctif

Une table `CRAFT_DENIAL_MESSAGES` sur le modèle de celle de la récolte, et
l'envoi du motif au client sur le canal que la fenêtre affiche déjà (« Objet
obtenu » porte bien « Fabrication réussie. » en cas de succès).

Le motif `no-such-recipe` mérite une formulation qui pointe la vraie cause :
« Aucune recette ne correspond à ces ingrédients. »

## Vérification

Poser une quantité qui ne correspond à aucune recette, cliquer « Combiner » :
un message apparaît sous « Objet obtenu ». Refaire avec un atelier fermé entre
temps : le motif diffère.

## Résolution

Deux gestes, et le second n'était pas prévu.

**Côté serveur** — `EXCHANGE_DENIAL_MESSAGES` sur le modèle de la récolte, et
`ExchangeFramesService.denial()` qui l'envoie sur `Im` / `InfoMessage`, le canal
que la récolte utilise déjà. Les onze branches de refus de `ExchangeHandler`
appellent `notifyDenial` en plus de leur `debug`. La table est délibérément
partielle : un motif sans phrase n'envoie rien plutôt qu'inventer une.

**Côté client** — `Im` arrivait bien, et n'était affiché nulle part.
`appendInfoMessage` n'écrivait que dans `chatStore.infos`, que seul
`SideChatPanel` lit, et **aucun écran ne le monte**. Les onze refus rédigés de
la récolte (QA-123) étaient dans le même cas depuis le début : le serveur les
envoyait, le client les rangeait, personne ne les voyait. `appendInfoMessage`
écrit désormais aussi dans le journal principal, dans le vert du canal Infos.

Relevé manette en main, 21 Bois de Frêne sur la Scie → « Combiner » :
**« Aucune recette ne correspond à ces ingrédients. »** en vert dans le chat.
Et, gratuitement, **« Vous êtes trop loin de cette ressource. »** au premier
`GA;500` émis trop tôt — le refus de QA-153, visible pour la première fois.
