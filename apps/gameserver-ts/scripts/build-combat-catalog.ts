import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { decodeZones } from "@dofus/grid";

import type {
  SpellEffect,
  SpellLevel,
} from "../src/core/modules/fight/cast/fight.spell.types";
import { Characteristic as C } from "../src/core/modules/fight/fight.types";
import {
  CLASS_SPECIAL_SPELLS,
  type CombatCatalog,
  type SummonTemplate,
} from "../src/core/modules/spells/combat-catalog.types";
import {
  decodeCombatEffects,
  stateIds,
} from "../src/core/modules/spells/spells.combat-data";
import { insertRows } from "./starloco-dump";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const [spellRaw, classRaw, monsterRaw, dump, sortRaw] = await Promise.all([
  read("assets/dist/langs/fr/spells.json"),
  read("assets/dist/langs/fr/classes.json"),
  read("assets/dist/langs/fr/monsters.json"),
  read("game.sql"),
  read("assets/sources/starloco/sorts.sql"),
]);
const spells: Record<number, Record<string, unknown>> = JSON.parse(spellRaw)
  .data.S;
const classes: Record<number, { s: number[] }> = JSON.parse(classRaw).data.G;
const monsters: Record<number, { n?: string; g?: number }> =
  JSON.parse(monsterRaw).data.M;
const sortRows = new Map(
  [...insertRows(sortRaw, "sorts")].map((row) => [Number(row[0]), row])
);
const monsterRows = new Map(
  [...insertRows(dump, "monsters")].map((row) => [Number(row[0]), row])
);
const catalog: CombatCatalog = {
  roots: [],
  names: {},
  levels: {},
  summons: {},
  sources: {},
};
for (const [name, content] of Object.entries({
  spells: spellRaw,
  classes: classRaw,
  monsters: monsterRaw,
  game: dump,
  sorts: sortRaw,
})) {
  catalog.sources[name] = createHash("sha256").update(content).digest("hex");
}
for (let classId = 1; classId <= 12; classId++) {
  for (const spellId of classes[classId]?.s ?? []) {
    catalog.roots.push({ classId, spellId, special: false });
  }
  const spellId = CLASS_SPECIAL_SPELLS[classId];
  if (spellId) {
    catalog.roots.push({ classId, spellId, special: true });
  }
}

function dumpEffects(value: string, zones: string): SpellEffect[] {
  if (!value || value === "-1") {
    return [];
  }
  const rows = value.split("|");
  const areas = decodeZones(zones, rows.length);
  return rows.map((line, i) => {
    const [
      id = 0,
      min = 0,
      max = -1,
      special = -1,
      duration = 0,
      probability = 0,
    ] = line.split(";").map(Number);
    return {
      id,
      min: Math.max(0, min),
      max: max < 0 ? Math.max(0, min) : max,
      special: Math.max(0, special),
      duration,
      probability,
      dice: line.split(";")[6] ?? "",
      param: "",
      areaKind: areas[i]?.kind ?? 0,
      areaSize: areas[i]?.size ?? 0,
      targetMask: 7,
    };
  });
}

/** Match source effects semantically; positional matching corrupts reversed lang arrays. */
function enrich(
  raw: unknown,
  zones: string,
  source: SpellEffect[],
  filters: number[]
): SpellEffect[] {
  const effects = decodeCombatEffects(raw, zones);
  const remaining = new Set(effects.map((_, i) => i));
  const ordered: SpellEffect[] = [];
  for (const [index, reference] of source.entries()) {
    const candidates = [...remaining].filter(
      (i) => effects[i]?.id === reference.id
    );
    candidates.sort((a, b) => {
      const score = (i: number) => {
        const e = effects[i];
        if (!e) { return Number.POSITIVE_INFINITY; }
        return (
          Math.abs(e.duration - reference.duration) * 10000 +
          Math.abs(e.probability - reference.probability) * 1000 +
          Math.abs(e.special - reference.special) * 100 +
          Math.abs(e.min - reference.min) +
          Math.abs(e.max - reference.max)
        );
      };
      // AVM1 array extraction reverses the effect list; this disambiguates equal lines.
      return score(a) - score(b) || b - a;
    });
    const chosen = candidates[0];
    if (chosen === undefined) {
      continue;
    }
    remaining.delete(chosen);
    const selected = effects[chosen];
    if (selected) { ordered.push({ ...selected, targetFilter: filters[index] ?? 0 }); }
  }
  // Newer local effects remain authoritative, even when the older dump lacks a line.
  for (const index of [...remaining].reverse()) {
    const effect = effects[index];
    if (effect) { ordered.push(effect); }
  }
  const areas = decodeZones(zones, ordered.length);
  return ordered.map((effect, i) => ({
    ...effect,
    areaKind: areas[i]?.kind ?? 0,
    areaSize: areas[i]?.size ?? 0,
    targetMask: [4, 50, 51, 180, 181, 185, 400, 401, 780, 783, 784].includes(
      effect.id
    )
      ? 8
      : 7,
  }));
}

function level(id: number, rank: number): SpellLevel {
  const spell = spells[id];
  const raw = spell?.[`l${rank}`];
  const row = sortRows.get(id);
  const fields = (row?.[rank + 3] ?? "").split(",").map((x) => x.trim());
  const filterLists = (row?.[10] ?? "0")
    .split(":")
    .map((x) => x.split(";").map(Number));
  const sourceNormal = dumpEffects(fields[0] ?? "", fields[15] ?? "");
  const sourceCritical = dumpEffects(
    fields[1] ?? "",
    (fields[15] ?? "").slice(sourceNormal.length * 2)
  );
  let normal: SpellEffect[], critical: SpellEffect[];
  if (Array.isArray(raw)) {
    const zone = String(raw[5] ?? "");
    normal = enrich(raw[20], zone, sourceNormal, filterLists[0] ?? []);
    critical = enrich(
      raw[19],
      zone.slice(normal.length * 2),
      sourceCritical,
      filterLists[1] ?? filterLists[0] ?? []
    );
  } else if (id === 203 && rank === 6 && fields.length >= 20) {
    normal = sourceNormal.map((e, i) => ({
      ...e,
      targetFilter: filterLists[0]?.[i] ?? 0,
    }));
    critical = sourceCritical.map((e, i) => ({
      ...e,
      targetFilter: filterLists[1]?.[i] ?? 0,
    }));
  } else {
    throw new Error(`Missing required spell ${id}:${rank}`);
  }
  // Félintion's local description explicitly includes pushing allies; the old dump does not.
  if (id === 412) {
    for (const effect of [...normal, ...critical]) {
      if (effect.id === 5) {
        effect.targetFilter = 2;
      }
    }
  }
  const n = (i: number, fallback = 0) =>
    Array.isArray(raw) ? Number(raw[i] ?? fallback) : fallback;
  const b = (i: number, fallback = false) =>
    Array.isArray(raw) ? raw[i] === true : fallback;
  catalog.names[id] = String(spell?.n ?? row?.[1] ?? id);
  return {
    spellId: id,
    level: rank,
    effects: normal,
    criticalEffects: critical,
    apCost: n(18, Number(fields[2])),
    rangeMin: n(17, Number(fields[3])),
    rangeMax: n(16, Number(fields[4])),
    criticalRate: n(15, Number(fields[5])),
    failureRate: n(14, Number(fields[6])),
    lineOnly: b(13, fields[7] === "true"),
    lineOfSight: b(12, fields[8] === "true"),
    emptyCell: b(11, fields[9] === "true"),
    modifiableRange: b(10, fields[10] === "true"),
    castPerTurn: n(8, Number(fields[12])),
    castPerTarget: n(7, Number(fields[13])),
    cooldown: n(6, Number(fields[14])),
    requiredStates: Array.isArray(raw) ? stateIds(raw[4]) : [],
    forbiddenStates: Array.isArray(raw) ? stateIds(raw[3]) : [],
    minPlayerLevel: n(2, Number(fields[18])),
    critFailureEndsTurn: b(1, fields[19] === "true"),
    visualGfxId: Number(row?.[2] ?? id),
  };
}

function summon(id: number, grade: number, isStatic: boolean): SummonTemplate {
  const row = monsterRows.get(id);
  if (!row) {
    throw new Error(`Missing summon template ${id}`);
  }
  const part = (column: number) =>
    (row[column] ?? "").split("|")[grade - 1] ?? "";
  const [levelPart, resistances] = part(4).split("@");
  const life = Number(part(9));
  if (!levelPart || life <= 0) {
    throw new Error(`Missing summon grade ${id}:${grade}`);
  }
  const stats: Record<number, number> = {};
  const mapValues = (chars: number[], text: string) =>
    text.split(/[;,]/).forEach((x, i) => {
      const characteristic = chars[i];
      if (characteristic !== undefined) {
        stats[characteristic] = Number(x) || 0;
      }
    });
  mapValues(
    [C.Strength, C.Wisdom, C.Intelligence, C.Chance, C.Agility],
    part(6)
  );
  mapValues(
    [
      C.ResistNeutralPct,
      C.ResistEarthPct,
      C.ResistFirePct,
      C.ResistWaterPct,
      C.ResistAirPct,
      C.DodgeAP,
      C.DodgeMP,
    ],
    resistances ?? ""
  );
  mapValues(
    [C.DamageBonus, C.DamagePercent, C.HealBonus, C.MaxSummons],
    row[7] ?? ""
  );
  const [ap = 0, mp = 0] = part(10).split(";").map(Number);
  const colors = (row[5] ?? "")
    .split(",")
    .map((x) => (!x || x === "-1" ? -1 : Number.parseInt(x, 16)));
  return {
    templateId: id,
    grade,
    level: Number(levelPart),
    name: monsters[id]?.n ?? row[1]?.trim() ?? String(id),
    gfx: monsters[id]?.g ?? Number(row[2]),
    colors: [colors[0] ?? -1, colors[1] ?? -1, colors[2] ?? -1],
    life,
    ap,
    mp,
    stats,
    ai: Number(row[15]),
    static: isStatic,
    spells: part(8)
      .split(";")
      .flatMap((token) => {
        const [spellId, level] = token.split("@").map(Number);
        return spellId && level ? [{ spellId, level }] : [];
      }),
  };
}

const queue = catalog.roots.flatMap(({ spellId }) =>
  [1, 2, 3, 4, 5, 6].map((rank) => [spellId, rank] as const)
);
for (let at = 0; at < queue.length; at++) {
  const entry = queue[at];
  if (!entry) {
    continue;
  }
  const [id, rank] = entry,
    key = `${id}:${rank}`;
  if (catalog.levels[key]) {
    continue;
  }
  const spell = level(id, rank);
  catalog.levels[key] = spell;
  for (const effect of [...spell.effects, ...spell.criticalEffects]) {
    if ([400, 401, 787].includes(effect.id)) {
      queue.push([effect.min, effect.max > 0 ? effect.max : rank]);
    }
    if (![181, 185].includes(effect.id)) {
      continue;
    }
    const key = `${effect.min}:${effect.max}`;
    const template =
      catalog.summons[key] ?? summon(effect.min, effect.max, effect.id === 185);
    catalog.summons[key] = template;
    for (const child of template.spells) {
      queue.push([child.spellId, child.level]);
    }
  }
}
const directory = new URL("apps/gameserver-ts/data/", root);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL("combat-catalog.json", directory),
  `${JSON.stringify(catalog)}\n`
);
console.log(
  `${catalog.roots.length} class spells, ${Object.keys(catalog.levels).length} total ranks, ${Object.keys(catalog.summons).length} summon grades`
);
