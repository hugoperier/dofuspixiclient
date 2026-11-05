import type { BoostableStat } from "@modules/stats/boost-cost";

/**
 * What each validation character wears and where its capital went.
 *
 * The fixture used to hand every class the same 10 000 vitality and no
 * equipment at all, which is fine for "does the spell animate" and
 * useless for anything that reads a characteristic: no class had the AP
 * its spells cost, the Osamodas could keep one summon alive, and a
 * 11 050 life bar made every damage number meaningless.
 *
 * So each build below is a level 200 that could exist on a 1.29 server:
 *
 * - **The capital is the real one.** 199 levels × 5 points = 995, priced
 *   through `boostCost` — the same table the boost handler charges. No
 *   scroll bonus is assumed (`expectedCapital` treats levels as the only
 *   source of capital, so scrolled stats would read as overspending).
 * - **The items are the real ones**, by template id, taken from the
 *   StarLoco 1.29 dump in `item_templates`. Nothing is invented and
 *   nothing is level-200-only gear that does not exist in the dump.
 * - **Jets are maximal.** A fixture that rolls its stats is a fixture
 *   whose numbers change under you between two runs.
 *
 * Base characteristics are 6 AP / 3 MP / 1 summon (`stats.constants`).
 * Every build reaches 9 AP and 5 MP the way 1.29 does it — a THL
 * amulet, Gelano, the Dofus Ocre, a pair of boots and the Dofus Vulbis
 * — except where the class asks for something else, and those
 * exceptions are noted on the build.
 */
export interface ValidationBuild {
  /** Shown by the seed script, and the one-line summary of the intent. */
  label: string;
  stats: Record<BoostableStat, number>;
  /** `[equipment position, item template id]`, positions per `item_super_types`. */
  gear: [position: number, templateId: number][];
}

/** Equipment positions, per `I.ss` in the 1.29 bundle. */
const AMULET = 0;
const WEAPON = 1;
const RING_LEFT = 2;
const BELT = 3;
const RING_RIGHT = 4;
const BOOTS = 5;
const HAT = 6;
const CLOAK = 7;
const DOFUS = [9, 10, 11, 12, 13, 14] as const;

// The six eggs every build below wears, in the order the slots go.
const OCRE = 7754; // +1 AP
const VULBIS = 6980; // +1 MP
const TURQUOISE = 739; // +20 critical
const EMERAUDE = 737; // +100 vitality
const CAWOTTE = 972; // +50 wisdom
const POURPRE = 694; // +50% damage
const EBENE = 7114; // +15 damage
const IVOIRE = 7115; // +2 range

function dofus(...ids: number[]): [number, number][] {
  return ids.map((id, index) => [DOFUS[index] as number, id]);
}

/**
 * The twelve builds, in class-id order (Feca is 1).
 *
 * Only the Osamodas and the Sadida *stack* summon slots. The odd +1 that
 * shows up elsewhere — Le Kim, the Ceinture Mycosine, the Qu'Tanneau —
 * comes with the item and is left alone: those pieces really do carry it
 * in 1.29, and stripping the fixture of them to keep a round number
 * would mean dressing the classes in gear nobody wore.
 *
 * Spells are the one thing here that is *not* a legitimate level 200:
 * the seed keeps every spell at rank 6, where 199 spell points buy about
 * thirteen. That is deliberate — the fixture exists to walk every spell
 * animation, and a realistic spell book would leave two thirds of them
 * uncastable.
 */
export const VALIDATION_BUILDS: Record<number, ValidationBuild> = {
  // Feca — intelligence, armour and a staff.

  1: {
    label: "Féca intelligence — 9 PA / 5 PM",
    stats: {
      intelligence: 250,
      vitality: 410,
      wisdom: 45,
      strength: 0,
      chance: 0,
      agility: 0,
    },
    gear: [
      [AMULET, 9463], // Amunite — +1 PA, 50 int
      [WEAPON, 7189], // Rod Gerse
      [RING_LEFT, 8877], // Kralano
      [BELT, 9143], // String Tue-Mouche
      [RING_RIGHT, 2469], // Gelano — +1 PA
      [BOOTS, 11547], // Bottes Qu'Tanées — +1 PM
      [HAT, 11548], // Couvre-chef corné de Qu'Tan
      [CLOAK, 9142], // Capignon
      ...dofus(OCRE, VULBIS, EMERAUDE, CAWOTTE, TURQUOISE, POURPRE),
    ],
  },

  // Osamodas — the full-summon build 1.29 actually played:
  // Kralamansion, Casque Harnage, Alliance Boletée and a Minokers
  // hammer stack eight summons on top of the base one.
  2: {
    label: "Osamodas invocations — 9 invocations, 9 PA / 5 PM",
    stats: {
      intelligence: 250,
      vitality: 410,
      wisdom: 45,
      strength: 0,
      chance: 0,
      agility: 0,
    },
    gear: [
      [AMULET, 9464], // Kralamansion — +1 PA, +2 invocations
      [WEAPON, 8616], // Marteau Minokers — +2 invocations
      [RING_LEFT, 9133], // Alliance Boletée — +2 invocations
      [BELT, 9143], // String Tue-Mouche
      [RING_RIGHT, 2469], // Gelano
      [BOOTS, 11547], // Bottes Qu'Tanées
      [HAT, 9181], // Casque Harnage — +2 invocations
      [CLOAK, 9142], // Capignon
      ...dofus(OCRE, VULBIS, EMERAUDE, CAWOTTE, TURQUOISE, POURPRE),
    ],
  },

  // Enutrof — chance and prospection, shovel in hand.
  3: {
    label: "Enutrof chance — 9 PA / 5 PM",
    stats: {
      chance: 250,
      vitality: 475,
      wisdom: 0,
      strength: 0,
      agility: 0,
      intelligence: 0,
    },
    gear: [
      [AMULET, 8272], // Collier du Minotot — +1 PA
      [WEAPON, 9468], // Pelle Emélaka
      [RING_LEFT, 9178], // Anneau Bliteré
      [BELT, 9183], // Ceinture Toré
      [RING_RIGHT, 2469], // Gelano
      [BOOTS, 8861], // Sandales Circulaires du Kimbo — +1 PM
      [HAT, 13170], // Le Kumokan
      [CLOAK, 8280], // Cape du Minotot
      ...dofus(OCRE, VULBIS, CAWOTTE, TURQUOISE, EMERAUDE, POURPRE),
    ],
  },

  // Sram — agility and daggers, the Qu'Tan set.
  4: {
    label: "Sram agilité — 9 PA / 5 PM",
    stats: {
      agility: 300,
      vitality: 395,
      wisdom: 0,
      strength: 0,
      chance: 0,
      intelligence: 0,
    },
    gear: [
      [AMULET, 11546], // Amulette de Qu'Tan — +1 PA
      [WEAPON, 9137], // Couteaux à Champignons
      [RING_LEFT, 11544], // Qu'Tanneau
      [BELT, 8856], // Ceinture Rasboulaire du Rasboul
      [RING_RIGHT, 2469], // Gelano
      [BOOTS, 11547], // Bottes Qu'Tanées — +1 PM
      [HAT, 11548], // Couvre-chef corné de Qu'Tan
      [CLOAK, 9141], // Caprin
      ...dofus(OCRE, VULBIS, TURQUOISE, EMERAUDE, CAWOTTE, POURPRE),
    ],
  },

  // Xelor — the AP class, so it pays for a tenth with the Coiffe du
  // Tynril, which is worn for its +1 AP and nothing else. That trade is
  // the Xelor build of 1.29.
  5: {
    label: "Xelor intelligence — 10 PA / 5 PM",
    stats: {
      intelligence: 300,
      vitality: 305,
      wisdom: 30,
      strength: 0,
      chance: 0,
      agility: 0,
    },
    gear: [
      [AMULET, 9463], // Amunite — +1 PA
      [WEAPON, 7189], // Rod Gerse
      [RING_LEFT, 8877], // Kralano
      [BELT, 9143], // String Tue-Mouche
      [RING_RIGHT, 2469], // Gelano — +1 PA
      [BOOTS, 11547], // Bottes Qu'Tanées — +1 PM
      [HAT, 8699], // Coiffe du Tynril — +1 PA
      [CLOAK, 9142], // Capignon
      ...dofus(OCRE, VULBIS, CAWOTTE, EMERAUDE, TURQUOISE, POURPRE),
    ],
  },

  // Ecaflip — strength and chance both, which is what its spells read.
  6: {
    label: "Ecaflip force/chance — 9 PA / 5 PM",
    stats: {
      strength: 250,
      chance: 100,
      vitality: 445,
      wisdom: 0,
      agility: 0,
      intelligence: 0,
    },
    gear: [
      [AMULET, 13168], // L'amulette Grobe Bambou — +1 PA
      [WEAPON, 8094], // L'Epée Rilleuse
      [RING_LEFT, 8991], // Annolamour
      [BELT, 11545], // Ceinture à plumes
      [RING_RIGHT, 2469], // Gelano
      [BOOTS, 8861], // Sandales Circulaires du Kimbo — +1 PM
      [HAT, 9461], // Le Kim
      [CLOAK, 11542], // Cape Ilyza'aile
      ...dofus(OCRE, VULBIS, TURQUOISE, POURPRE, EMERAUDE, EBENE),
    ],
  },

  // Eniripsa — intelligence and every heal bonus the dump has.
  7: {
    label: "Eniripsa intelligence/soins — 9 PA / 5 PM",
    stats: {
      intelligence: 300,
      vitality: 260,
      wisdom: 45,
      strength: 0,
      chance: 0,
      agility: 0,
    },
    gear: [
      [AMULET, 9463], // Amunite — +1 PA, +10 soins
      [WEAPON, 7189], // Rod Gerse
      [RING_LEFT, 8877], // Kralano — +10 soins
      [BELT, 9143], // String Tue-Mouche — +10 soins
      [RING_RIGHT, 2469], // Gelano
      [BOOTS, 11547], // Bottes Qu'Tanées — +1 PM
      [HAT, 8284], // Coiffe du Minotot — +8 soins
      [CLOAK, 9142], // Capignon — +7 soins
      ...dofus(OCRE, VULBIS, CAWOTTE, EMERAUDE, TURQUOISE, POURPRE),
    ],
  },

  // Iop — strength, and the Mycelium/Kim pieces that carry it.
  8: {
    label: "Iop force — 9 PA / 5 PM",
    stats: {
      strength: 300,
      vitality: 395,
      wisdom: 0,
      chance: 0,
      agility: 0,
      intelligence: 0,
    },
    gear: [
      [AMULET, 13168], // L'amulette Grobe Bambou — +1 PA
      [WEAPON, 8094], // L'Epée Rilleuse
      [RING_LEFT, 9132], // Anneau Chevelu
      [BELT, 9144], // Ceinture Mycosine
      [RING_RIGHT, 2469], // Gelano
      [BOOTS, 9140], // Chaussons Pignons — +1 PM
      [HAT, 9461], // Le Kim
      [CLOAK, 8876], // Voile d'encre
      ...dofus(OCRE, VULBIS, POURPRE, EBENE, TURQUOISE, EMERAUDE),
    ],
  },

  // Cra — agility and range, the Ivory Dofus carrying the range.

  9: {
    label: "Cra agilité — 9 PA / 5 PM, +2 PO",
    stats: {
      agility: 300,
      vitality: 395,
      wisdom: 0,
      strength: 0,
      chance: 0,
      intelligence: 0,
    },
    gear: [
      [AMULET, 11546], // Amulette de Qu'Tan — +1 PA
      [WEAPON, 8924], // Arc à Chon
      [RING_LEFT, 11544], // Qu'Tanneau
      [BELT, 8856], // Ceinture Rasboulaire du Rasboul
      [RING_RIGHT, 2469], // Gelano
      [BOOTS, 11547], // Bottes Qu'Tanées — +1 PM
      [HAT, 11548], // Couvre-chef corné de Qu'Tan
      [CLOAK, 9141], // Caprin
      ...dofus(OCRE, VULBIS, IVOIRE, TURQUOISE, EMERAUDE, POURPRE),
    ],
  },

  // Sadida — intelligence, and enough summon room for the dolls.
  10: {
    label: "Sadida intelligence — 5 invocations, 9 PA / 5 PM",
    stats: {
      intelligence: 250,
      vitality: 410,
      wisdom: 45,
      strength: 0,
      chance: 0,
      agility: 0,
    },
    gear: [
      [AMULET, 9463], // Amunite — +1 PA
      [WEAPON, 7189], // Rod Gerse
      [RING_LEFT, 9133], // Alliance Boletée — +2 invocations
      [BELT, 9143], // String Tue-Mouche
      [RING_RIGHT, 2469], // Gelano
      [BOOTS, 11547], // Bottes Qu'Tanées — +1 PM
      [HAT, 9181], // Casque Harnage — +2 invocations
      [CLOAK, 9142], // Capignon
      ...dofus(OCRE, VULBIS, EMERAUDE, CAWOTTE, TURQUOISE, POURPRE),
    ],
  },

  // Sacrieur — the class whose capital goes almost entirely into life,
  // wearing the Ougah set for the same reason.
  11: {
    label: "Sacrieur vitalité — 9 PA / 5 PM",
    stats: {
      strength: 100,
      vitality: 695,
      wisdom: 0,
      chance: 0,
      agility: 0,
      intelligence: 0,
    },
    gear: [
      [AMULET, 9130], // Ougamulette — +1 PA
      [WEAPON, 9117], // Ougarteau
      [RING_LEFT, 9132], // Anneau Chevelu
      [BELT, 9146], // Ougature
      [RING_RIGHT, 2469], // Gelano
      [BOOTS, 9140], // Chaussons Pignons — +1 PM
      [HAT, 7680], // Ougalurette
      [CLOAK, 8876], // Voile d'encre
      ...dofus(OCRE, VULBIS, EMERAUDE, POURPRE, EBENE, TURQUOISE),
    ],
  },

  // Pandawa — strength, and the Grobe set it was written for.
  12: {
    label: "Pandawa force — 9 PA / 5 PM",
    stats: {
      strength: 300,
      vitality: 345,
      wisdom: 0,
      chance: 0,
      agility: 0,
      intelligence: 0,
    },
    gear: [
      [AMULET, 13168], // L'amulette Grobe Bambou — +1 PA
      [WEAPON, 9117], // Ougarteau
      [RING_LEFT, 8991], // Annolamour
      [BELT, 11545], // Ceinture à plumes
      [RING_RIGHT, 2469], // Gelano
      [BOOTS, 13169], // Les Grollbes — +1 PM
      [HAT, 13167], // Coiffe de Bill de Grobe
      [CLOAK, 11542], // Cape Ilyza'aile
      ...dofus(OCRE, VULBIS, EMERAUDE, POURPRE, TURQUOISE, EBENE),
    ],
  },
};
