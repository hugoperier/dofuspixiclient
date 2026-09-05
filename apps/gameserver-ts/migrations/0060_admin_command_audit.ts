import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<never>): Promise<void> {
  await sql`
    CREATE TABLE admin_command_audit (
      request_id text PRIMARY KEY,
      actor_account_id bigint NOT NULL,
      actor_player_id bigint,
      target_player_id bigint,
      source text NOT NULL CHECK (source IN ('drawer', 'chat')),
      command text NOT NULL,
      parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
      before_state jsonb,
      after_state jsonb,
      result text NOT NULL CHECK (
        result IN ('confirmation_required', 'success', 'error', 'forbidden')
      ),
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_admin_command_audit_actor_created
      ON admin_command_audit(actor_account_id, created_at DESC)
  `.execute(db);
  await sql`
    CREATE INDEX idx_admin_command_audit_target_created
      ON admin_command_audit(target_player_id, created_at DESC)
      WHERE target_player_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<never>): Promise<void> {
  await sql`DROP TABLE IF EXISTS admin_command_audit`.execute(db);
}
