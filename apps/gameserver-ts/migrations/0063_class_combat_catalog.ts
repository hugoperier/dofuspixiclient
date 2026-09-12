import { type Kysely, sql } from "kysely";

import { combatCatalog } from "../src/core/modules/spells/combat-catalog";

export async function up(db: Kysely<never>): Promise<void> {
  await sql`CREATE TABLE combat_spell_backup_0063 AS SELECT * FROM spell_levels`.execute(
    db
  );
  await sql`CREATE TABLE summon_grades (
    template_id integer NOT NULL, grade integer NOT NULL,
    data jsonb NOT NULL, PRIMARY KEY(template_id, grade)
  )`.execute(db);
  for (const template of Object.values(combatCatalog.summons)) {
    await sql`INSERT INTO summon_grades VALUES (${template.templateId}, ${template.grade}, ${JSON.stringify(template)}::jsonb)`.execute(
      db
    );
  }
  for (const level of Object.values(combatCatalog.levels)) {
    await sql`INSERT INTO spell_templates (id, name, sprite)
      VALUES (${level.spellId}, ${combatCatalog.names[level.spellId] ?? String(level.spellId)}, ${level.visualGfxId})
      ON CONFLICT (id) DO NOTHING`.execute(db);
    await sql`INSERT INTO spell_levels (
      spell_id, level, effects, critical_effects, ap_cost, range_min, range_max,
      critical_rate, failure_rate, line_of_sight, empty_cell, modifiable_range,
      cast_per_turn, cast_per_target, cooldown, line_only, visual_gfx_id,
      min_player_level, crit_failure_ends_turn, required_states, forbidden_states
    ) VALUES (
      ${level.spellId}, ${level.level}, ${JSON.stringify(level.effects)}::jsonb,
      ${JSON.stringify(level.criticalEffects)}::jsonb, ${level.apCost}, ${level.rangeMin}, ${level.rangeMax},
      ${level.criticalRate}, ${level.failureRate}, ${level.lineOfSight}, ${level.emptyCell}, ${level.modifiableRange},
      ${level.castPerTurn}, ${level.castPerTarget}, ${level.cooldown}, ${level.lineOnly}, ${level.visualGfxId},
      ${level.minPlayerLevel}, ${level.critFailureEndsTurn}, ${JSON.stringify(level.requiredStates)}::jsonb,
      ${JSON.stringify(level.forbiddenStates)}::jsonb
    ) ON CONFLICT (spell_id, level) DO UPDATE SET
      effects=excluded.effects, critical_effects=excluded.critical_effects,
      required_states=excluded.required_states, forbidden_states=excluded.forbidden_states,
      visual_gfx_id=excluded.visual_gfx_id`.execute(db);
  }
}

export async function down(db: Kysely<never>): Promise<void> {
  await sql`UPDATE spell_levels s SET effects=b.effects, critical_effects=b.critical_effects,
    required_states=b.required_states, forbidden_states=b.forbidden_states, visual_gfx_id=b.visual_gfx_id
    FROM combat_spell_backup_0063 b WHERE s.spell_id=b.spell_id AND s.level=b.level`.execute(
    db
  );
  for (const level of Object.values(combatCatalog.levels)) {
    await sql`DELETE FROM spell_levels s WHERE s.spell_id=${level.spellId} AND s.level=${level.level}
      AND NOT EXISTS (SELECT 1 FROM combat_spell_backup_0063 b WHERE b.spell_id=s.spell_id AND b.level=s.level)`.execute(
      db
    );
  }
  await sql`DROP TABLE summon_grades, combat_spell_backup_0063`.execute(db);
}
