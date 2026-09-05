import type { TransactionalAdapterKysely } from "@nestjs-cls/transactional-adapter-kysely";
import type { AdminCommandAuditRow, DB, PlayerRow } from "@shared/db/schema";
import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";

export interface AdminPlayerRow extends PlayerRow {
  accountPseudo: string;
}

export interface AuditWrite {
  requestId: string;
  actorAccountId: string;
  actorPlayerId: string | null;
  targetPlayerId: string | null;
  source: "drawer" | "chat";
  command: string;
  parameters: unknown;
  beforeState: unknown | null;
  afterState: unknown | null;
  result: AdminCommandAuditRow["result"];
  error: string | null;
}

@Injectable()
export class AdminRepository {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterKysely<DB>>
  ) {}

  async isAdmin(accountId: string): Promise<boolean> {
    const row = await this.txHost.tx
      .selectFrom("accounts")
      .select("isAdmin")
      .where("id", "=", accountId)
      .executeTakeFirst();
    return row?.isAdmin === true;
  }

  searchPlayers(query: string, limit: number): Promise<AdminPlayerRow[]> {
    const base = this.txHost.tx
      .selectFrom("players")
      .innerJoin("accounts", "accounts.id", "players.accountId")
      .selectAll("players")
      .select("accounts.pseudo as accountPseudo")
      .where("players.deletedAt", "is", null);

    const byId = query.startsWith("#") ? query.slice(1) : null;
    const filtered = byId
      ? base.where("players.id", "=", byId)
      : base.where("players.name", "ilike", `%${query}%`);

    return filtered.orderBy("players.name", "asc").limit(limit).execute();
  }

  findPlayerById(playerId: string): Promise<AdminPlayerRow | undefined> {
    return this.txHost.tx
      .selectFrom("players")
      .innerJoin("accounts", "accounts.id", "players.accountId")
      .selectAll("players")
      .select("accounts.pseudo as accountPseudo")
      .where("players.id", "=", playerId)
      .where("players.deletedAt", "is", null)
      .executeTakeFirst();
  }

  findPlayersByExactName(name: string): Promise<AdminPlayerRow[]> {
    return this.txHost.tx
      .selectFrom("players")
      .innerJoin("accounts", "accounts.id", "players.accountId")
      .selectAll("players")
      .select("accounts.pseudo as accountPseudo")
      .where("players.name", "ilike", name)
      .where("players.deletedAt", "is", null)
      .limit(2)
      .execute();
  }

  findAudit(requestId: string): Promise<AdminCommandAuditRow | undefined> {
    return this.txHost.tx
      .selectFrom("adminCommandAudit")
      .selectAll()
      .where("requestId", "=", requestId)
      .executeTakeFirst();
  }

  async writeAudit(input: AuditWrite): Promise<void> {
    await this.txHost.tx
      .insertInto("adminCommandAudit")
      .values(input)
      .onConflict((oc) =>
        oc.column("requestId").doUpdateSet({
          targetPlayerId: input.targetPlayerId,
          source: input.source,
          command: input.command,
          parameters: input.parameters,
          beforeState: input.beforeState,
          afterState: input.afterState,
          result: input.result,
          error: input.error,
          updatedAt: new Date(),
        })
      )
      .execute();
  }

  async setPlayerValues(
    playerId: string,
    values: Partial<
      Pick<
        PlayerRow,
        | "mapId"
        | "cellId"
        | "direction"
        | "kamas"
        | "experience"
        | "level"
        | "statsPoints"
        | "spellPoints"
        | "life"
        | "energy"
        | "lifeUpdatedAt"
      >
    >
  ): Promise<void> {
    await this.txHost.tx
      .updateTable("players")
      .set(values)
      .where("id", "=", playerId)
      .where("deletedAt", "is", null)
      .execute();
  }

  playerStats(playerId: string) {
    return this.txHost.tx
      .selectFrom("playerStats")
      .selectAll()
      .where("playerId", "=", playerId)
      .executeTakeFirst();
  }

  playerSpells(playerId: string) {
    return this.txHost.tx
      .selectFrom("playerSpells")
      .select(["spellId", "level"])
      .where("playerId", "=", playerId)
      .execute();
  }

  classSpellsAboveLevel(playerId: string, classId: number, level: number) {
    return this.txHost.tx
      .selectFrom("playerSpells")
      .innerJoin("classSpells", (join) =>
        join
          .onRef("classSpells.spellId", "=", "playerSpells.spellId")
          .on("classSpells.classId", "=", classId)
      )
      .select([
        "playerSpells.spellId",
        "playerSpells.level",
        "classSpells.learnLevel",
      ])
      .where("playerSpells.playerId", "=", playerId)
      .where("classSpells.learnLevel", ">", level)
      .execute();
  }

  async deleteClassSpellsAboveLevel(
    playerId: string,
    classId: number,
    level: number
  ): Promise<void> {
    const ids = await this.txHost.tx
      .selectFrom("classSpells")
      .select("spellId")
      .where("classId", "=", classId)
      .where("learnLevel", ">", level)
      .execute();
    if (ids.length === 0) {
      return;
    }
    await this.txHost.tx
      .deleteFrom("playerSpells")
      .where("playerId", "=", playerId)
      .where(
        "spellId",
        "in",
        ids.map((row) => row.spellId)
      )
      .execute();
  }
}
