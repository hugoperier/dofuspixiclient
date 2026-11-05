import type { TransactionalAdapterKysely } from "@nestjs-cls/transactional-adapter-kysely";
import type { DB } from "@shared/db/schema";
import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";

@Injectable()
export class LoginRepository {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterKysely<DB>>
  ) {}

  findByUsername(username: string) {
    return this.txHost.tx
      .selectFrom("accounts")
      .select(["id", "pwdHash", "isBanned"])
      .where("username", "=", username)
      .executeTakeFirst();
  }

  async markLoggedIn(accountId: string, ip: string | null): Promise<void> {
    await this.txHost.tx
      .updateTable("accounts")
      .set({ lastLoginAt: new Date(), lastLoginIp: ip })
      .where("id", "=", accountId)
      .execute();
  }

  /**
   * Appends to the login history the welcome line reads back.
   *
   * Separate from `markLoggedIn` because that one *overwrites*: by the
   * time the player finishes entering the game, the columns it sets
   * already describe the current connection, so there is nowhere left to
   * read the previous one from.
   */
  async recordLogin(accountId: string, ip: string | null): Promise<void> {
    await this.txHost.tx
      .insertInto("accountLogins")
      .values({ accountId, ip })
      .execute();
  }
}
