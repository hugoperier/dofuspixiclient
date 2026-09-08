import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import type { DB } from "../src/core/shared/db/schema";
import {
  derivePasswordKey,
  hashPasswordKey,
} from "../src/core/features/auth/password-key";
import { characterGfx } from "../src/core/features/auth/provision-account/provision-account.service";
import { findSpawnCell } from "../src/core/modules/maps/spawn-point";
import { xpForLevel } from "../src/core/modules/players/players.progression.constants";
import { combatCatalog } from "../src/core/modules/spells/combat-catalog";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://dofus:dofus@localhost:5432/dofus";
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(connectionString).hostname
  )
) {
  throw new Error("Validation réservée à PostgreSQL local.");
}
const password = process.env.COMBAT_VALIDATION_PASSWORD;
if (!password) {
  throw new Error(
    "COMBAT_VALIDATION_PASSWORD requis pour les nouveaux comptes de validation."
  );
}
const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  plugins: [new CamelCasePlugin()],
});
const names = [
  "Feca",
  "Osamodas",
  "Enutrof",
  "Sram",
  "Xelor",
  "Ecaflip",
  "Eniripsa",
  "Iop",
  "Cra",
  "Sadida",
  "Sacrieur",
  "Pandawa",
];
try {
  const mapId = Number(process.env.SPAWN_MAP_ID ?? 7411);
  const cellId = await findSpawnCell(db, mapId);
  if (cellId === null) {
    throw new Error("Carte de validation absente ou impraticable.");
  }
  for (let classId = 1; classId <= 12; classId++) {
    const username = `retro-validation-${String(classId).padStart(2, "0")}`;
    const pseudo = `Validation Retro ${names[classId - 1]}`;
    const pwdHash = await hashPasswordKey(
      await derivePasswordKey(password, username)
    );
    await db.transaction().execute(async (tx) => {
      let account = await tx
        .selectFrom("accounts")
        .selectAll()
        .where("username", "=", username)
        .executeTakeFirst();
      if (
        account &&
        account.pseudo !== pseudo &&
        account.pseudo !== "Validation des classes Retro"
      ) {
        throw new Error(`Compte ${username} non créé par cette fixture.`);
      }
      account ??= await tx
        .insertInto("accounts")
        .values({
          username,
          pwdHash,
          pseudo,
          lastLoginAt: null,
          lastLoginIp: null,
          bannedUntil: null,
          banReason: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await tx
        .insertInto("accountServers")
        .values({ accountId: account.id, serverId: 1, characterCount: 1 })
        .onConflict((oc) =>
          oc
            .columns(["accountId", "serverId"])
            .doUpdateSet({ characterCount: 1 })
        )
        .execute();
      let player = await tx
        .selectFrom("players")
        .selectAll()
        .where("accountId", "=", account.id)
        .where("class", "=", classId)
        .executeTakeFirst();
      player ??= await tx
        .insertInto("players")
        .values({
          accountId: account.id,
          serverId: 1,
          name: `Validation-${names[classId - 1]}`,
          class: classId,
          sex: 0,
          gfx: characterGfx(classId, 0),
          deletedAt: null,
          lifeUpdatedAt: new Date(),
          mapId,
          cellId,
          savepointMapId: mapId,
          savepointCellId: cellId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await tx
        .updateTable("players")
        .set({
          level: 200,
          experience: String(xpForLevel(200)),
          life: 11050,
          spellPoints: 0,
        })
        .where("id", "=", player.id)
        .execute();
      await tx
        .insertInto("playerStats")
        .values({ playerId: player.id, vitality: 10000 })
        .onConflict((oc) =>
          oc.column("playerId").doUpdateSet({ vitality: 10000 })
        )
        .execute();
      await tx
        .insertInto("playerColors")
        .values({ playerId: player.id })
        .onConflict((oc) => oc.column("playerId").doNothing())
        .execute();
      const spells = combatCatalog.roots.filter((r) => r.classId === classId);
      for (const [index, ref] of spells.entries()) {
        await tx
          .insertInto("playerSpells")
          .values({
            playerId: player.id,
            spellId: ref.spellId,
            level: 6,
            position: index + 1,
          })
          .onConflict((oc) =>
            oc
              .columns(["playerId", "spellId"])
              .doUpdateSet({ level: 6, position: index + 1 })
          )
          .execute();
      }
      console.log(
        `${username}: ${player.name}, ${spells.length} sorts rang 6, carte ${player.mapId}`
      );
    });
  }
} finally {
  await db.destroy();
}
