/**
 * Why an exchange gesture was refused, in words the player can act on.
 *
 * QA-123 states the rule for this whole worksite: "Tout refus doit terminer
 * l'action et produire une raison exploitable par le client ; aucune branche
 * ne doit rester silencieuse." The harvest holds it —
 * `HARVEST_DENIAL_MESSAGES` carries eleven written reasons — and crafting was
 * the one flow that did not: `CraftFlow` names its refusals precisely and
 * `ExchangeHandler` dropped every one of them into a `debug`, so "Combiner"
 * on a quantity no recipe wants produced nothing at all. QA-159.
 *
 * The table is deliberately partial. A reason with no entry here stays in the
 * log alone, exactly as before — `denial()` sends nothing rather than invent
 * a sentence. The ones written out are the ones a player can actually do
 * something about; a `no-session` or a `not-target` is a client that fell out
 * of step, and telling the player about it helps nobody.
 */
export const EXCHANGE_DENIAL_MESSAGES: Record<string, string> = {
  // The bench — CraftFlow, and the same names in SecureCraftFlow.
  "no-such-recipe": "Aucune recette ne correspond à ces ingrédients.",
  "empty-bench": "Posez d'abord des ingrédients dans l'atelier.",
  "no-bench": "L'atelier n'est plus ouvert.",
  "no-slot-left": "L'atelier n'a plus de case libre.",
  "recipe-too-large": "Cette recette demande plus de cases que vous n'en avez.",
  "skill-locked": "Votre niveau dans ce métier est insuffisant.",
  "not-enough": "Vous n'avez pas cette quantité.",
  equipped: "Un objet équipé ne peut pas servir d'ingrédient.",
  "invalid-quantity": "Quantité invalide.",
  "not-found": "Cet objet n'est plus dans votre inventaire.",

  // The co-operative craft — SecureCraftFlow.
  self: "Vous ne pouvez pas vous inviter vous-même.",
  "different-map": "Cette personne n'est plus sur votre carte.",
  "target-not-found": "Cette personne n'est plus là.",
  "target-busy": "Cette personne est déjà occupée.",
  "already-exchanging": "Vous êtes déjà dans un échange.",
  "no-job": "Vous ne connaissez pas ce métier.",
  "no-tool": "Vous devez équiper l'outil du métier.",
  "not-a-craft-skill": "Ce métier ne se pratique pas à deux.",
  pending: "Une demande est déjà en attente.",
  "not-a-party": "Cet ingrédient n'est pas le vôtre.",
};
