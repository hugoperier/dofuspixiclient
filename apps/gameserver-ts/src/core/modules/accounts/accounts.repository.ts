import type { TransactionalAdapterKysely } from "@nestjs-cls/transactional-adapter-kysely";
import type { DB } from "@shared/db/schema";
import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";

export interface PreviousLogin {
  at: Date;
  ip: string | null;
}

@Injectable()
export class AccountsRepository {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterKysely<DB>>
  ) {}

  /**
   * The connection *before* the current one, or `undefined` on a first
   * login.
   *
   * authd has already written the row for the session asking the
   * question, so the newest row is never the answer — the second one is.
   * Taking two and dropping the head is what makes that explicit; a
   * `!= now()` filter would be a guess about clock skew.
   */
  async findPreviousLogin(
    accountId: string
  ): Promise<PreviousLogin | undefined> {
    const rows = await this.txHost.tx
      .selectFrom("accountLogins")
      .select(["at", "ip"])
      .where("accountId", "=", accountId)
      .orderBy("at", "desc")
      .orderBy("id", "desc")
      .limit(2)
      .execute();

    const previous = rows[1];

    return previous ? { at: previous.at, ip: previous.ip } : undefined;
  }
}
