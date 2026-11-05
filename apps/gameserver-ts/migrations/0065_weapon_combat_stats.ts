import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type Kysely, sql } from "kysely";

import { parseWeaponInfo } from "../src/core/modules/inventory/weapon-info.ts";

/**
 * A weapon's close-combat statistics, so the melee attack can exist.
 *
 * 1.29's `dofus.datacenter.CloseCombat` builds `Spell(0, 1)` and then
 * overrides its AP cost, range, criticals and line rules with the
 * equipped weapon's. Those numbers live only in the lang bundle's `e`
 * array (`I.u[<id>].e`) — the StarLoco dump has no column for them and
 * `item_templates` had nowhere to put them, which is why the server
 * could not resolve a weapon swing at all.
 *
 * Seeded exactly like `0039` seeds the spells: read the committed
 * bundle, upsert in chunks, idempotent. `weapon_info` stays null for
 * the ~7000 items that carry no `e` block, and the cast path treats
 * null as bare hands.
 */

const LANG_RELATIVE = "../../../assets/dist/langs/fr/items.json";

function langPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, LANG_RELATIVE);
}

export async function up(db: Kysely<never>): Promise<void> {
  await db.schema
    .alterTable("item_templates")
    .addColumn("weapon_info", "jsonb")
    .execute();

  const raw = await readFile(langPath(), "utf8");
  const parsed = JSON.parse(raw) as {
    data?: { I?: { u?: Record<string, { e?: unknown }> } };
  };
  const items = parsed.data?.I?.u ?? {};

  const rows: { id: number; weapon_info: string }[] = [];

  for (const [idStr, item] of Object.entries(items)) {
    const id = Number.parseInt(idStr, 10);
    const info = parseWeaponInfo(item.e);

    if (!Number.isFinite(id) || !info) {
      continue;
    }

    rows.push({ id, weapon_info: JSON.stringify(info) });
  }

  // An UPDATE, not an upsert: an item the dump never imported has no
  // row to attach stats to, and inventing one would put a nameless
  // template in front of the inventory window.
  const chunkSize = 500;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = sql.join(
      chunk.map((row) => sql`(${row.id}::integer, ${row.weapon_info}::jsonb)`)
    );

    await sql`
      UPDATE item_templates AS t
      SET weapon_info = v.weapon_info
      FROM (VALUES ${values}) AS v(id, weapon_info)
      WHERE t.id = v.id
    `.execute(db);
  }

  console.log(`[0065] weapon_info set on up to ${rows.length} templates`);
}

export async function down(db: Kysely<never>): Promise<void> {
  await db.schema
    .alterTable("item_templates")
    .dropColumn("weapon_info")
    .execute();
}
