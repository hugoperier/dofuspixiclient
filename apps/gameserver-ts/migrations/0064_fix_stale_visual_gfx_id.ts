import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type Kysely, sql } from "kysely";

import { combatCatalog } from "../src/core/modules/spells/combat-catalog";

/**
 * Repairs `spell_levels.visual_gfx_id` for every spell 0041 silently
 * skipped.
 *
 * 0040 backfilled `visual_gfx_id := spell_id` as a placeholder. 0041 was
 * meant to replace it with the canonical `sorts.sprite`, and its docblock
 * claims it coalesces `-1 → NULL` — but the code does
 * `if (parsed.sprite < 0) continue;`, which *skips the row* and leaves the
 * placeholder in place. Spells absent from the dump were never visited at
 * all.
 *
 * The placeholder is not inert: it is a positive integer, so the runtime
 * treats it as a real gfx id and asks the client for
 * `/assets/spritesheets/spells/<spell_id>.dofasset`, which does not exist.
 * The client then reports "L'animation du sort N n'a pas pu être affichée."
 * on every cast. Measured on the 1.29 dump: 1259 rows carry `sprite = -1`
 * and 415 spells are absent from `sorts` entirely.
 *
 * Authoritative order, per spell:
 *   1. the class combat catalogue (written by 0063) — never overridden;
 *   2. `sorts.sprite` when > 0;
 *   3. NULL otherwise — "no spell-specific visual", which the cast path
 *      renders as the caster's own pose.
 */
export async function up(db: Kysely<never>): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const sortsPath = resolve(here, "../../../assets/sources/starloco/sorts.sql");

  let raw: string;
  try {
    raw = await readFile(sortsPath, "utf8");
  } catch {
    console.warn(
      `[0064] sorts.sql missing at ${sortsPath} — skipping repair. ` +
        `Drop the file in place and re-run.`
    );
    return;
  }

  // Every row, including sprite <= 0 — that is precisely what 0041 threw
  // away. sprite 0 (pose-only) and -1 (no own visual) both become NULL.
  const dumped: { id: number; sprite: number }[] = [];
  const lineRe = /^INSERT INTO `sorts` VALUES \((.*)\);\s*$/gm;
  for (const m of raw.matchAll(lineRe)) {
    const parsed = parseFirstThree(m[1] ?? "");
    if (parsed) {
      dumped.push(parsed);
    }
  }

  if (dumped.length === 0) {
    console.warn("[0064] sorts.sql parsed but no rows extracted");
    return;
  }

  // The class catalogue is hand-curated and outranks the dump — but it
  // is authoritative per (spell_id, level), not per spell. Spell 1688
  // "Répulsion" is the proof: the catalogue carries only its level 1, so
  // excluding the whole spell would leave levels 2-6 on the 0040
  // placeholder.
  const curated = Object.values(combatCatalog.levels).map((level) => ({
    spellId: level.spellId,
    level: level.level,
  }));

  await sql`CREATE TABLE combat_spell_backup_0064 AS
    SELECT spell_id, level, visual_gfx_id FROM spell_levels`.execute(db);

  // One pass: every non-curated level takes the dump's verdict, and a
  // level whose spell the dump never mentions is cleared outright.
  const dumpedValues = sql.join(
    dumped.map(
      ({ id, sprite }) => sql`(${id}::int, ${sprite > 0 ? sprite : null}::int)`
    ),
    sql`, `
  );
  const curatedValues =
    curated.length > 0
      ? sql.join(
          curated.map((c) => sql`(${c.spellId}::int, ${c.level}::int)`),
          sql`, `
        )
      : sql`(NULL::int, NULL::int)`;

  const result = await sql`
    WITH dumped(spell_id, sprite) AS (VALUES ${dumpedValues}),
         curated(spell_id, level) AS (VALUES ${curatedValues})
    UPDATE spell_levels sl
    SET visual_gfx_id = d.sprite
    FROM (SELECT * FROM dumped) d
    WHERE d.spell_id = sl.spell_id
      AND sl.visual_gfx_id IS DISTINCT FROM d.sprite
      AND NOT EXISTS (
        SELECT 1 FROM curated c
        WHERE c.spell_id = sl.spell_id AND c.level = sl.level
      )
  `.execute(db);

  const orphans = await sql`
    WITH dumped(spell_id) AS (VALUES ${sql.join(
      dumped.map(({ id }) => sql`(${id}::int)`),
      sql`, `
    )}),
         curated(spell_id, level) AS (VALUES ${curatedValues})
    UPDATE spell_levels sl
    SET visual_gfx_id = NULL
    WHERE sl.visual_gfx_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM dumped d WHERE d.spell_id = sl.spell_id)
      AND NOT EXISTS (
        SELECT 1 FROM curated c
        WHERE c.spell_id = sl.spell_id AND c.level = sl.level
      )
  `.execute(db);

  console.log(
    `[0064] visual_gfx_id repair: ${Number(result.numAffectedRows ?? 0)} ` +
      `rows realigned on sorts.sprite, ` +
      `${Number(orphans.numAffectedRows ?? 0)} cleared (spell absent from sorts), ` +
      `${curated.length} curated levels left untouched`
  );
}

export async function down(db: Kysely<never>): Promise<void> {
  await sql`UPDATE spell_levels s SET visual_gfx_id = b.visual_gfx_id
    FROM combat_spell_backup_0064 b
    WHERE s.spell_id = b.spell_id AND s.level = b.level`.execute(db);
  await sql`DROP TABLE combat_spell_backup_0064`.execute(db);
}

/**
 * Walk a tuple body to grab the 1st (int), 2nd (string), 3rd (int).
 * Same shape as 0041's parser — mysqldump single-quotes the name column
 * and escapes with backslashes, so scan past it rather than splitting.
 */
function parseFirstThree(body: string): { id: number; sprite: number } | null {
  let pos = 0;
  const comma1 = body.indexOf(",", pos);
  if (comma1 < 0) {
    return null;
  }
  const id = Number.parseInt(body.slice(0, comma1).trim(), 10);
  if (!Number.isFinite(id)) {
    return null;
  }
  pos = comma1 + 1;

  while (pos < body.length && body[pos] === " ") {
    pos++;
  }
  if (body[pos] !== "'") {
    return null;
  }
  pos++;
  while (pos < body.length) {
    const ch = body[pos];
    if (ch === "\\") {
      pos += 2;
      continue;
    }
    if (ch === "'") {
      pos++;
      break;
    }
    pos++;
  }

  while (pos < body.length && (body[pos] === " " || body[pos] === ",")) {
    pos++;
  }
  const comma3 = body.indexOf(",", pos);
  if (comma3 < 0) {
    return null;
  }
  const sprite = Number.parseInt(body.slice(pos, comma3).trim(), 10);
  if (!Number.isFinite(sprite)) {
    return null;
  }

  return { id, sprite };
}
