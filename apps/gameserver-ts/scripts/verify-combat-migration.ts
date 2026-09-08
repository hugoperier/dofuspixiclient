import assert from "node:assert/strict";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { down, up } from "../migrations/0063_class_combat_catalog";
import { combatCatalog } from "../src/core/modules/spells/combat-catalog";

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !["localhost", "127.0.0.1", "::1"].includes(new URL(connectionString).hostname)) {
  throw new Error("This verification requires the local development database.");
}
const db = new Kysely<never>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max: 1 }) }) });
const rollback = new Error("ROLLBACK_SUCCESSFUL_VERIFICATION");
try {
  await db.transaction().execute(async transaction => {
    await sql`CREATE SCHEMA retro_combat_migration_verification`.execute(transaction);
    await sql`SET LOCAL search_path TO retro_combat_migration_verification`.execute(transaction);
    await sql`CREATE TABLE spell_templates (LIKE public.spell_templates INCLUDING ALL)`.execute(transaction);
    await sql`INSERT INTO spell_templates SELECT * FROM public.spell_templates`.execute(transaction);
    await sql`CREATE TABLE spell_levels (LIKE public.spell_levels INCLUDING ALL)`.execute(transaction);
    await sql`INSERT INTO spell_levels SELECT * FROM public.combat_spell_backup_0063`.execute(transaction);
    const digest = async () => (await sql<{ digest: string }>`SELECT md5(string_agg(row_to_json(s)::text, '' ORDER BY spell_id, level)) AS digest FROM spell_levels s`.execute(transaction)).rows[0]?.digest;
    const before = await digest();
    await up(transaction);
    const grades = await sql<{ count: string }>`SELECT count(*) FROM summon_grades`.execute(transaction);
    assert.equal(Number(grades.rows[0]?.count), Object.keys(combatCatalog.summons).length);
    const moquerie = await sql<{ effects: unknown }>`SELECT effects FROM spell_levels WHERE spell_id=203 AND level=6`.execute(transaction);
    assert.deepEqual(moquerie.rows[0]?.effects, combatCatalog.levels["203:6"]?.effects);
    await down(transaction);
    assert.equal(await digest(), before, "Rollback must restore every original spell rank exactly");
    await up(transaction);
    console.log("PASS: migration 0063 up → down → up, exact rank restoration and 222 summon grades; isolated schema rolled back.");
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally { await db.destroy(); }
