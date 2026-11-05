import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type Kysely, sql } from "kysely";

/**
 * `item_templates.animation_id` stores the bundle's `an`, and nothing else.
 *
 * `0059` gave the column `NOT NULL DEFAULT 3`, and the importer wrote
 * `an ?? 3`: an item whose bundle entry names no animation came out as
 * if it named `anim3`. That is right for a harvest and wrong in a fight —
 * `PlayableCharacter.ToolAnimation` answers `anim0` there, so the 17
 * weapons without an `an` (Petite Epée Sacrée, La Klebik, the Dagues
 * Fourbesques…) would swing with the harvesting pose. The default belongs
 * to the reader, so the column now says "none" with NULL.
 *
 * Only rows whose bundle entry has no `an` change: every other row was
 * written from the same bundle and already holds its value.
 */

const LANG_RELATIVE = "../../../assets/dist/langs/fr/items.json";

function langPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, LANG_RELATIVE);
}

export async function up(db: Kysely<never>): Promise<void> {
  await sql`
    ALTER TABLE item_templates
      ALTER COLUMN animation_id DROP NOT NULL,
      ALTER COLUMN animation_id DROP DEFAULT
  `.execute(db);

  const raw = await readFile(langPath(), "utf8");
  const parsed = JSON.parse(raw) as {
    data?: { I?: { u?: Record<string, { an?: unknown }> } };
  };
  const items = parsed.data?.I?.u ?? {};

  const ids = Object.entries(items)
    .filter(([, item]) => typeof item.an !== "number")
    .map(([id]) => Number.parseInt(id, 10))
    .filter((id) => Number.isFinite(id));

  const chunkSize = 1000;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);

    await sql`
      UPDATE item_templates
      SET animation_id = NULL
      WHERE id IN (${sql.join(chunk)})
    `.execute(db);
  }

  console.log(`[0067] animation_id cleared on up to ${ids.length} templates`);
}

export async function down(db: Kysely<never>): Promise<void> {
  await sql`
    UPDATE item_templates SET animation_id = 3 WHERE animation_id IS NULL
  `.execute(db);
  await sql`
    ALTER TABLE item_templates
      ALTER COLUMN animation_id SET DEFAULT 3,
      ALTER COLUMN animation_id SET NOT NULL
  `.execute(db);
}
