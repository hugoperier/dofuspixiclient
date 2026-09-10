import { type Kysely, sql } from "kysely";

/**
 * One row per successful login, so the welcome line can name the
 * *previous* connection.
 *
 * `accounts.last_login_at` / `last_login_ip` cannot answer that: authd
 * overwrites them during the very login the player is completing, and
 * enter-game runs after. Keeping the history also makes "where did this
 * account connect from" answerable at all, which a pair of overwritten
 * columns never was.
 */
export async function up(db: Kysely<never>): Promise<void> {
  await db.schema
    .createTable("account_logins")
    .addColumn("id", "bigserial", (col) => col.primaryKey())
    .addColumn("account_id", "bigint", (col) =>
      col.notNull().references("accounts.id").onDelete("cascade")
    )
    .addColumn("at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("ip", sql`INET`)
    .execute();

  // The only read is "the two most recent rows for this account", which
  // is exactly this index walked backwards.
  await db.schema
    .createIndex("account_logins_account_at_idx")
    .on("account_logins")
    .columns(["account_id", "at desc"])
    .execute();
}

export async function down(db: Kysely<never>): Promise<void> {
  await db.schema.dropTable("account_logins").execute();
}
