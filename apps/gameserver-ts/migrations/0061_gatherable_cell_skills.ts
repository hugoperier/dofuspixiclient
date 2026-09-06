import { type Kysely, sql } from "kysely";

/**
 * One placed resource, several jobs — QA-154.
 *
 * `job_gatherable_cells` had `skill_id` on the occurrence itself, under a
 * `(map_id, cell_id)` primary key, which spelled out "a cell carries exactly
 * one harvest skill". 1 480 cells of the world say otherwise: a flax plant is
 * picked by the Alchimiste (the flower) *and* cut by the Paysan (the stalk),
 * and the import had to choose. The Alchimiste won every time, which left the
 * Paysan with **nothing at all to harvest at level 40** — its Lin (skill 50)
 * and its Chanvre (54) existed on zero cells.
 *
 * The primary key is deliberately left alone. It is what makes an occurrence's
 * availability unique, which is the whole of QA-132: two jobs share one plant
 * and therefore one respawn, and **the first harvest consumes it for both** —
 * the 1.29 reading, and the one the unchanged key already gives for free. What
 * moves is only the skill, out of the occurrence and into this join.
 *
 * `skill_id` and `resource_item_id` leave `job_gatherable_cells` with it: an
 * occurrence accepting two skills has neither one skill nor one resource, and
 * the item handed over already follows the skill the player asked for
 * (`HarvestService.finish` reads `skill.harvestItemId`), never the row.
 */
export async function up(db: Kysely<never>): Promise<void> {
  await sql`
    CREATE TABLE job_gatherable_cell_skills (
      map_id integer NOT NULL,
      cell_id integer NOT NULL,
      skill_id integer NOT NULL REFERENCES job_skills(id) ON DELETE CASCADE,
      PRIMARY KEY (map_id, cell_id, skill_id)
    )
  `.execute(db);

  // The lookup on every single `GA;500`: "does this occurrence accept the
  // skill that was asked for".
  await sql`
    CREATE INDEX idx_gatherable_cell_skills_cell
      ON job_gatherable_cell_skills(map_id, cell_id)
  `.execute(db);

  // Carry over what the last import found. A re-import rebuilds both tables
  // wholesale and will widen this to every skill each model offers; until
  // then the world keeps exactly the placements it had.
  await sql`
    INSERT INTO job_gatherable_cell_skills (map_id, cell_id, skill_id)
    SELECT map_id, cell_id, skill_id FROM job_gatherable_cells
    ON CONFLICT DO NOTHING
  `.execute(db);

  await sql`ALTER TABLE job_gatherable_cells DROP COLUMN IF EXISTS skill_id`.execute(
    db
  );
  await sql`ALTER TABLE job_gatherable_cells DROP COLUMN IF EXISTS resource_item_id`.execute(
    db
  );
}

export async function down(db: Kysely<never>): Promise<void> {
  await sql`ALTER TABLE job_gatherable_cells ADD COLUMN IF NOT EXISTS resource_item_id integer`.execute(
    db
  );
  await sql`ALTER TABLE job_gatherable_cells ADD COLUMN IF NOT EXISTS skill_id integer`.execute(
    db
  );

  // One skill per cell again — the lowest id, arbitrarily but reproducibly.
  await sql`
    UPDATE job_gatherable_cells g
       SET skill_id = k.skill_id,
           resource_item_id = s.harvest_item_id
      FROM (
        SELECT map_id, cell_id, min(skill_id) AS skill_id
          FROM job_gatherable_cell_skills GROUP BY map_id, cell_id
      ) k
      JOIN job_skills s ON s.id = k.skill_id
     WHERE g.map_id = k.map_id AND g.cell_id = k.cell_id
  `.execute(db);

  await sql`DELETE FROM job_gatherable_cells WHERE skill_id IS NULL`.execute(
    db
  );
  await sql`ALTER TABLE job_gatherable_cells ALTER COLUMN skill_id SET NOT NULL`.execute(
    db
  );
  await sql`DROP TABLE IF EXISTS job_gatherable_cell_skills`.execute(db);
}
