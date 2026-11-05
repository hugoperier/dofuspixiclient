import type { CombatCatalog } from "./combat-catalog.types";
import generated from "../../../../data/combat-catalog.json";

/** Frozen, reproducible build artifact; migrations and offline audits use the same inputs. */
export const combatCatalog: CombatCatalog =
  generated as unknown as CombatCatalog;
