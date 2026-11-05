/**
 * Writes the quick-connect roster the dev client's login screen reads.
 *
 *   COMBAT_VALIDATION_PASSWORD=… bun run scripts/dev-accounts.ts
 *
 * Why a generated file rather than a constant somewhere: the accounts are
 * whatever you happen to have seeded. `dev-seed.ts` makes one playable
 * character, `seed-combat-validation.ts` makes twelve level-200 ones, and
 * both take their password from the command line — so nothing in the repo
 * can know them ahead of time, and a hand-written list goes stale the
 * first time you re-seed.
 *
 * What lands on disk is the **derived key**, never the password. That is
 * what the client puts on the wire anyway (`AccountSendIdentity`), so it
 * grants nothing extra, it keeps a password people may have reused out of
 * a file, and it makes a quick connect instant: the 600 000 PBKDF2 rounds
 * are paid once here instead of on every click.
 *
 * Every key is checked against `accounts.pwd_hash` before it is written.
 * A wrong `COMBAT_VALIDATION_PASSWORD` fails here, loudly, instead of
 * producing thirteen buttons that all answer "bad credentials".
 *
 * The output is gitignored and only ever served by the Vite dev server
 * (`vite.config.ts`, `/__dev-accounts`), which does not exist in a build.
 */
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import type { DB } from "../src/core/shared/db/schema";
import { derivePasswordKey } from "../src/core/features/auth/password-key";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://dofus:dofus@localhost:5432/dofus";

// Same guard as the validation fixture: this writes credentials to disk,
// and it has no business pointing at anything but a local database.
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(connectionString).hostname
  )
) {
  throw new Error("Roster de développement réservé à PostgreSQL local.");
}

/**
 * Which seeded families to look for, and where their password comes from.
 *
 * `dev` defaults to the password `just db-seed` uses; the validation
 * accounts have no default at all, because the fixture that creates them
 * refuses to run without `COMBAT_VALIDATION_PASSWORD` either.
 */
const FAMILIES = [
  {
    match: (username: string) => username === "dev",
    password: process.env.DEV_PASSWORD ?? "dev",
    order: 0,
  },
  {
    match: (username: string) => username.startsWith("retro-validation-"),
    password: process.env.COMBAT_VALIDATION_PASSWORD,
    order: 1,
  },
] as const;

export interface DevAccount {
  username: string;
  /** What the button says. */
  label: string;
  /** The character to walk in as, when the account has exactly one. */
  character: string | null;
  level: number | null;
  classId: number | null;
  /** Base64 PBKDF2 key — what `AccountSendIdentity` carries. */
  passwordKey: string;
}

const OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../dev-accounts.json"
);

const CLASS_NAMES = [
  "Féca",
  "Osamodas",
  "Enutrof",
  "Sram",
  "Xélor",
  "Ecaflip",
  "Eniripsa",
  "Iop",
  "Crâ",
  "Sadida",
  "Sacrieur",
  "Pandawa",
];

const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  plugins: [new CamelCasePlugin()],
});

try {
  const rows = await db
    .selectFrom("accounts")
    .leftJoin("players", (join) =>
      join
        .onRef("players.accountId", "=", "accounts.id")
        .on("players.deletedAt", "is", null)
    )
    .select([
      "accounts.username as username",
      "accounts.pwdHash as pwdHash",
      "players.name as character",
      "players.level as level",
      "players.class as classId",
    ])
    .orderBy("accounts.username")
    .execute();

  const accounts: (DevAccount & { order: number })[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const family = FAMILIES.find((entry) => entry.match(row.username));

    if (!family) {
      continue;
    }

    if (!family.password) {
      skipped.push(`${row.username} (mot de passe absent de l'environnement)`);
      continue;
    }

    const passwordKey = await derivePasswordKey(family.password, row.username);

    if (!(await Bun.password.verify(passwordKey, row.pwdHash))) {
      skipped.push(`${row.username} (mot de passe refusé par le compte)`);
      continue;
    }

    accounts.push({
      order: family.order,
      username: row.username,
      label: label(row.username, row.classId, row.level),
      character: row.character,
      level: row.level,
      classId: row.classId,
      passwordKey,
    });
  }

  accounts.sort(
    (a, b) =>
      a.order - b.order ||
      (a.classId ?? 0) - (b.classId ?? 0) ||
      a.username.localeCompare(b.username)
  );

  await writeFile(
    OUTPUT,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        accounts: accounts.map(({ order: _order, ...rest }) => rest),
      },
      null,
      2
    )}\n`,
    "utf-8"
  );

  console.log(`${accounts.length} comptes écrits dans ${OUTPUT}`);
  for (const account of accounts) {
    console.log(`  ${account.label} — ${account.username}`);
  }
  for (const line of skipped) {
    console.warn(`  ignoré : ${line}`);
  }
} finally {
  await db.destroy();
}

/** "Féca 200" reads better on a button than "retro-validation-01". */
function label(
  username: string,
  classId: number | null,
  level: number | null
): string {
  if (username === "dev") {
    return "Dev";
  }

  const className = classId ? CLASS_NAMES[classId - 1] : undefined;

  if (!className) {
    return username;
  }

  return level ? `${className} ${level}` : className;
}
