import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type Kysely, sql } from "kysely";

/**
 * Imports `sorts.spriteInfos` — the three values 1.29 sends after the gfx
 * id in `GA;300` (`GameActionsEx.as:409-434`):
 *
 *   "<displayType>,<casterAnimation>,<inFrontOfSprite>"   e.g. "51,0,1"
 *
 * `displayType` is how `VisualEffectHandler.onLoadInit` anchors the visual:
 * on the caster (10/12), on the target (11), as a linear or ballistic
 * projectile (20/21, 30/31), as a beam (40/41), or at the world origin
 * with the clip reading `cellFrom` / `cellTo` itself (50/51). The SWF does
 * not carry it, and one gfx serves several displayTypes (gfx 503 is 11 for
 * Ralentissement and 10 for Protection Aveuglante), so it belongs to the
 * spell, not to the visual. Without it the client fell back on whatever
 * each generated spell module guessed — 119 class spells guessed wrong.
 * See QA-181.
 *
 * `casterAnimation` is the caster's pose, `anim<n>` (Frappe de Xélor
 * plays `anim0`, not the default `anim1`). `inFrontOfSprite` picks the
 * side of the caster sprite the effect is layered on.
 *
 * The values are per spell, like `sorts` rows, so they go on
 * `spell_templates`. NULL means "not in the dump": the server keeps its
 * old defaults and the client falls back to the module's own value.
 */
export async function up(db: Kysely<never>): Promise<void> {
  await sql`ALTER TABLE spell_templates
    ADD COLUMN display_type smallint,
    ADD COLUMN cast_animation smallint,
    ADD COLUMN sprite_in_front boolean`.execute(db);

  const here = dirname(fileURLToPath(import.meta.url));
  const sortsPath = resolve(here, "../../../assets/sources/starloco/sorts.sql");

  let raw: string;
  try {
    raw = await readFile(sortsPath, "utf8");
  } catch {
    console.warn(
      `[0068] sorts.sql missing at ${sortsPath} — columns added, none filled. ` +
        `Drop the file in place and re-run.`
    );
    return;
  }

  const rows: SpriteInfos[] = [];
  const lineRe = /^INSERT INTO `sorts` VALUES \((.*)\);\s*$/gm;
  for (const m of raw.matchAll(lineRe)) {
    const parsed = parseSpriteInfos(m[1] ?? "");
    if (parsed) {
      rows.push(parsed);
    }
  }

  if (rows.length === 0) {
    console.warn("[0068] sorts.sql parsed but no spriteInfos extracted");
    return;
  }

  const values = sql.join(
    rows.map(
      (r) =>
        sql`(${r.id}::int, ${r.displayType}::smallint, ${r.castAnimation}::smallint, ${r.inFront}::boolean)`
    ),
    sql`, `
  );
  const result = await sql`
    WITH dumped(id, display_type, cast_animation, sprite_in_front) AS (VALUES ${values})
    UPDATE spell_templates t
    SET display_type = d.display_type,
        cast_animation = d.cast_animation,
        sprite_in_front = d.sprite_in_front
    FROM dumped d
    WHERE d.id = t.id
  `.execute(db);

  console.log(
    `[0068] spriteInfos: ${Number(result.numAffectedRows ?? 0)} spell templates ` +
      `filled from ${rows.length} sorts rows`
  );
}

export async function down(db: Kysely<never>): Promise<void> {
  await sql`ALTER TABLE spell_templates
    DROP COLUMN display_type,
    DROP COLUMN cast_animation,
    DROP COLUMN sprite_in_front`.execute(db);
}

interface SpriteInfos {
  id: number;
  displayType: number | null;
  castAnimation: number | null;
  inFront: boolean | null;
}

/**
 * Walk a `sorts` tuple body to its 1st (id) and 4th (spriteInfos) values:
 * `(id, 'nom', sprite, 'spriteInfos', …)`. mysqldump single-quotes the
 * strings and escapes with backslashes, so the name is scanned past rather
 * than split on commas — the same walk as 0041 and 0064.
 */
export function parseSpriteInfos(body: string): SpriteInfos | null {
  const comma1 = body.indexOf(",");
  if (comma1 < 0) {
    return null;
  }
  const id = Number.parseInt(body.slice(0, comma1).trim(), 10);
  if (!Number.isFinite(id)) {
    return null;
  }

  // Skip the quoted name.
  let pos = skipQuoted(body, comma1 + 1);
  if (pos < 0) {
    return null;
  }
  // Skip the sprite integer.
  const comma3 = body.indexOf(",", pos + 1);
  if (comma3 < 0) {
    return null;
  }
  pos = comma3 + 1;
  while (body[pos] === " ") {
    pos++;
  }
  if (body[pos] !== "'") {
    return null;
  }
  const close = body.indexOf("'", pos + 1);
  if (close < 0) {
    return null;
  }
  const fields = body.slice(pos + 1, close).split(",");
  const int = (value: string | undefined): number | null => {
    const n = Number.parseInt(value ?? "", 10);
    return Number.isFinite(n) ? n : null;
  };
  const displayType = int(fields[0]);
  const front = int(fields[2]);
  return {
    id,
    // 0 is the dump's "no info" placeholder ('0,0,0'), not a displayType —
    // VisualEffectHandler.addEffect ignores anything below 10.
    displayType: displayType !== null && displayType >= 10 ? displayType : null,
    castAnimation: int(fields[1]),
    inFront: front === null ? null : front === 1,
  };
}

/** Index just past the closing quote of the string starting at `from`. */
function skipQuoted(body: string, from: number): number {
  let pos = from;
  while (body[pos] === " ") {
    pos++;
  }
  if (body[pos] !== "'") {
    return -1;
  }
  pos++;
  while (pos < body.length) {
    const ch = body[pos];
    if (ch === "\\") {
      pos += 2;
      continue;
    }
    if (ch === "'") {
      return pos + 1;
    }
    pos++;
  }
  return -1;
}
