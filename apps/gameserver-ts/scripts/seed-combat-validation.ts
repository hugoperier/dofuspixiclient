import { CamelCasePlugin, Kysely, PostgresDialect } from "kysely";
import pg from "pg";

import type { DB } from "../src/core/shared/db/schema";
import {
  derivePasswordKey,
  hashPasswordKey,
} from "../src/core/features/auth/password-key";
import { characterGfx } from "../src/core/features/auth/provision-account/provision-account.service";
import { evaluateCriteria } from "../src/core/modules/inventory/equip-criteria";
import { OwnerKind } from "../src/core/modules/items/item-owner";
import { findSpawnCell } from "../src/core/modules/maps/spawn-point";
import { capitalSpentOnStats } from "../src/core/modules/players/players.capital";
import {
  STAT_POINTS_PER_LEVEL,
  xpForLevel,
} from "../src/core/modules/players/players.progression.constants";
import { combatCatalog } from "../src/core/modules/spells/combat-catalog";
import { maxLifePoints } from "../src/core/modules/stats/stats.constants";
import { VALIDATION_BUILDS } from "./combat-validation-builds";

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
const LEVEL = 200;
/** 199 levels of five points each — the only source of capital 1.29 has. */
const CAPITAL = (LEVEL - 1) * STAT_POINTS_PER_LEVEL;

/**
 * The characteristic effects an equipment jet is rolled for. Everything
 * else on a template — a weapon's damage dice, a pet's feeding
 * counters — is copied through untouched: those are not jets, and
 * "maximising" them would make an item the dump never described.
 */
const ROLLED_EFFECTS = new Set([
  111, 112, 115, 117, 118, 119, 122, 123, 124, 125, 126, 128, 138, 158, 174,
  175, 178, 182,
]);

interface TemplateEffect {
  id: number;
  param1: number;
  param2: number;
  param3: string;
}

/**
 * The instance an item takes when it is rolled at its maximum.
 *
 * `item_templates.effects` carries the bounds (`param1`..`param2`); an
 * item in a bag carries the value that was rolled, in `param1`, with
 * `param2` at zero — the shape `items.effects` already holds for every
 * item the game itself created.
 */
function maxRoll(effects: TemplateEffect[]): TemplateEffect[] {
  return effects.map((effect) => {
    if (!ROLLED_EFFECTS.has(effect.id) || effect.param2 <= effect.param1) {
      return effect;
    }
    return {
      id: effect.id,
      param1: effect.param2,
      param2: 0,
      param3: `0d0+${effect.param2}`,
    };
  });
}

function effectTotal(effects: TemplateEffect[], id: number): number {
  return effects
    .filter((effect) => effect.id === id)
    .reduce((sum, effect) => sum + Math.max(effect.param1, effect.param2), 0);
}

/** The six characteristic effects an item criterion can be read against. */
const CRITERIA_STATS: Record<number, keyof typeof EMPTY_TOTALS> = {
  118: "strength",
  126: "intelligence",
  119: "agility",
  125: "vitality",
  123: "chance",
  124: "wisdom",
};

const EMPTY_TOTALS = {
  strength: 0,
  intelligence: 0,
  agility: 0,
  vitality: 0,
  chance: 0,
  wisdom: 0,
};

/**
 * Refuse any piece the character could not actually put on.
 *
 * A THL weapon in 1.29 asks for element totals — `CA>200&CC>200&CS>200`
 * on the Az'tech — and some items ask for things this server cannot
 * check at all: `Le Ramboton` wants the pseudonym `xxramboplxx`. Writing
 * rows straight into `items` walks past `InventoryService.equip`, so
 * without this the fixture would happily dress a character in gear the
 * game would have refused, which is the opposite of what it is for.
 *
 * Each item is judged on the totals of *the others*, because that is the
 * state the character is in at the moment it equips this one.
 */
function assertWearable(
  label: string,
  equipment: {
    position: number;
    template: { name: string | null; criteria: string | null };
    effects: TemplateEffect[];
  }[],
  baseStats: typeof EMPTY_TOTALS
): void {
  for (const item of equipment) {
    const totals = { ...baseStats };
    for (const other of equipment) {
      if (other === item) {
        continue;
      }
      for (const effect of other.effects) {
        const stat = CRITERIA_STATS[effect.id];
        if (stat) {
          totals[stat] += Math.max(effect.param1, effect.param2);
        }
      }
    }

    let unsupported: string | null = null;
    const wearable = evaluateCriteria(
      item.template.criteria ?? "",
      { ...totals, level: LEVEL, sex: 0 },
      (code) => {
        unsupported = code;
      }
    );
    if (!wearable) {
      throw new Error(
        `${label}: ${item.template.name} (slot ${item.position}) refusé — ` +
          (unsupported
            ? `critère non supporté \`${unsupported}\` dans "${item.template.criteria}"`
            : `critère "${item.template.criteria}" non rempli ` +
              `(For ${totals.strength}, Int ${totals.intelligence}, ` +
              `Agi ${totals.agility}, Cha ${totals.chance}, ` +
              `Vita ${totals.vitality}, Sag ${totals.wisdom})`)
      );
    }
  }
}

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
      const build = VALIDATION_BUILDS[classId];
      if (!build) {
        throw new Error(`Aucun build de validation pour la classe ${classId}.`);
      }

      // The capital check is the whole point of the fixture being
      // "legit": a build that overspends is a character the game itself
      // would never have produced, and `expectedCapital` — the repair
      // tool — would flag it on sight.
      const spent = capitalSpentOnStats(classId, build.stats);
      if (spent > CAPITAL) {
        throw new Error(
          `${build.label}: ${spent} points dépensés pour ${CAPITAL} disponibles.`
        );
      }

      const templates = await tx
        .selectFrom("itemTemplates")
        .select(["id", "name", "level", "effects", "type", "criteria"])
        .where(
          "id",
          "in",
          build.gear.map(([, templateId]) => templateId)
        )
        .execute();
      const byTemplate = new Map(templates.map((t) => [t.id, t]));

      const equipment = build.gear.map(([position, templateId]) => {
        const template = byTemplate.get(templateId);
        if (!template) {
          throw new Error(
            `${build.label}: template ${templateId} absent de item_templates ` +
              `— le monde StarLoco n'est pas importé ?`
          );
        }
        if ((template.level ?? 1) > LEVEL) {
          throw new Error(
            `${build.label}: ${template.name} est niveau ${template.level}.`
          );
        }
        return {
          position,
          template,
          effects: maxRoll((template.effects ?? []) as TemplateEffect[]),
        };
      });

      assertWearable(build.label, equipment, {
        strength: build.stats.strength,
        intelligence: build.stats.intelligence,
        agility: build.stats.agility,
        vitality: build.stats.vitality,
        chance: build.stats.chance,
        wisdom: build.stats.wisdom,
      });

      const gearVitality = equipment.reduce(
        (sum, item) => sum + effectTotal(item.effects, 125),
        0
      );
      const totalVitality = build.stats.vitality + gearVitality;

      await tx
        .updateTable("players")
        .set({
          level: LEVEL,
          experience: String(xpForLevel(LEVEL)),
          life: maxLifePoints(LEVEL, totalVitality),
          statsPoints: CAPITAL - spent,
          spellPoints: 0,
        })
        .where("id", "=", player.id)
        .execute();
      await tx
        .insertInto("playerStats")
        .values({ playerId: player.id, ...build.stats })
        .onConflict((oc) => oc.column("playerId").doUpdateSet(build.stats))
        .execute();

      // Worn items only: whatever the character is carrying in its bag
      // is somebody's test setup and is left alone.
      await tx
        .deleteFrom("items")
        .where("ownerKind", "=", OwnerKind.Player)
        .where("ownerId", "=", player.id)
        .where("position", ">=", 0)
        .execute();
      await tx
        .insertInto("items")
        .values(
          equipment.map((item) => ({
            templateId: item.template.id,
            position: item.position,
            quantity: 1,
            effects: JSON.stringify(item.effects),
            ownerKind: OwnerKind.Player,
            ownerId: player.id,
          }))
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
      const ap =
        6 + equipment.reduce((n, i) => n + effectTotal(i.effects, 111), 0);
      const mp =
        3 + equipment.reduce((n, i) => n + effectTotal(i.effects, 128), 0);
      const summons =
        1 + equipment.reduce((n, i) => n + effectTotal(i.effects, 182), 0);
      console.log(
        `${username}: ${build.label} — ${spent}/${CAPITAL} points, ` +
          `${maxLifePoints(LEVEL, totalVitality)} PV, ${ap} PA, ${mp} PM, ` +
          `${summons} invoc, ${equipment.length} équipements, ` +
          `${spells.length} sorts rang 6, carte ${player.mapId}`
      );
    });
  }
} finally {
  await db.destroy();
}
