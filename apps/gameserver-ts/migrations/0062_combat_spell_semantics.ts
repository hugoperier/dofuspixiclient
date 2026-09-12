import { readFile } from "node:fs/promises";

import { type Kysely, sql } from "kysely";

import {
  decodeCombatEffects,
  stateIds,
} from "../src/core/modules/spells/spells.combat-data";

export async function up(db: Kysely<never>): Promise<void> {
  await sql`ALTER TABLE spell_levels ADD COLUMN required_states jsonb NOT NULL DEFAULT '[]', ADD COLUMN forbidden_states jsonb NOT NULL DEFAULT '[]'`.execute(
    db
  );
  const path = new URL(
    "../../../assets/dist/langs/fr/spells.json",
    import.meta.url
  );
  const data: { data: { S: Record<string, Record<string, unknown>> } } =
    JSON.parse(await readFile(path, "utf8"));
  // Re-read the original tuples: some installations predate the duration/probability fix.
  // Blindly swapping stored fields would corrupt installations seeded after that fix.
  for (const [id, spell] of Object.entries(data.data.S)) {
    for (let rank = 1; rank <= 6; rank++) {
      const level = spell[`l${rank}`];
      if (!Array.isArray(level) || level.length < 21) {
        continue;
      }
      const zones = typeof level[5] === "string" ? level[5] : "";
      const normal = decodeCombatEffects(level[20], zones);
      await sql`UPDATE spell_levels SET required_states=${JSON.stringify(stateIds(level[4]))}::jsonb,
        forbidden_states=${JSON.stringify(stateIds(level[3]))}::jsonb,
        effects=${JSON.stringify(normal)}::jsonb,
        critical_effects=${JSON.stringify(decodeCombatEffects(level[19], zones.slice(normal.length * 2)))}::jsonb
        WHERE spell_id=${Number(id)} AND level=${rank}`.execute(db);
    }
  }
}

export async function down(db: Kysely<never>): Promise<void> {
  await sql`ALTER TABLE spell_levels DROP COLUMN required_states, DROP COLUMN forbidden_states`.execute(
    db
  );
}
