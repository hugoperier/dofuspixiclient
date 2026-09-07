import { readFile, writeFile } from "node:fs/promises";

import {
  combatUnavailableReason,
  decodeCombatEffects,
} from "../src/core/modules/spells/spells.combat-data";

const root = new URL("../../../", import.meta.url);
const spells: Record<string, Record<string, unknown>> = JSON.parse(
  await readFile(new URL("assets/dist/langs/fr/spells.json", root), "utf8")
).data.S;
const classes: Record<string, { sn: string; s: number[] }> = JSON.parse(
  await readFile(new URL("assets/dist/langs/fr/classes.json", root), "utf8")
).data.G;
function inspect(
  id: number,
  rank: number,
  visited = new Set<number>()
): { reason: string; effects: number[]; triggers: number[] } {
  const level = spells[id]?.[`l${rank}`];
  if (!Array.isArray(level) || visited.has(id)) {
    return {
      reason: "Données absentes ou dépendance cyclique",
      effects: [],
      triggers: [],
    };
  }
  const normal = decodeCombatEffects(level[20], String(level[5] ?? ""));
  const all = [
    ...normal,
    ...decodeCombatEffects(
      level[19],
      String(level[5] ?? "").slice(normal.length * 2)
    ),
  ];
  let reason = combatUnavailableReason(all);
  const triggers = [
    ...new Set(
      all.filter((e) => e.id === 400 || e.id === 401).map((e) => e.min)
    ),
  ];
  for (const trigger of triggers) {
    const child = inspect(trigger, rank, new Set([...visited, id]));
    const raw = spells[trigger]?.[`l${rank}`];
    if (
      !reason &&
      (child.reason ||
        !Array.isArray(raw) ||
        decodeCombatEffects(raw[20], String(raw[5] ?? "")).some(
          (e) => e.id < 96 || e.id > 100
        ))
    ) {
      reason = "Effets déclenchés indisponibles";
    }
  }
  return { reason, effects: [...new Set(all.map((e) => e.id))], triggers };
}
const lines = [
  "# Couverture des sorts du premier combat",
  "",
  "Généré par `bun run scripts/audit-combat-spells.ts` depuis `apps/gameserver-ts`. Utilise le décodeur et les capacités du serveur. **Disponible signifie pris en charge par ce socle, pas certifié conforme en totalité à 1.29.** Le catalogue local contient aussi des données Retro ultérieures ; ses états et sorts spéciaux ne constituent pas une preuve historique.",
  "",
  "Les sorts incomplets restent consultables avec leur motif et sont refusés avant la dépense de PA. Un effet critique manquant bloque le rang entier.",
  "",
];
let refs = 0,
  available = 0,
  total = 0;
function row(id: number): void {
  const enabled: number[] = [],
    ids = new Set<number>(),
    deps = new Set<number>(),
    reasons = new Map<string, number[]>();
  for (let rank = 1; rank <= 6; rank++) {
    if (!spells[id]?.[`l${rank}`]) {
      continue;
    }
    total++;
    const r = inspect(id, rank);
    for (const effect of r.effects) {
      ids.add(effect);
    }
    for (const trigger of r.triggers) {
      deps.add(trigger);
    }
    if (!r.reason) {
      enabled.push(rank);
      available++;
    } else {
      reasons.set(r.reason, [...(reasons.get(r.reason) ?? []), rank]);
    }
  }
  lines.push(
    `| ${id} — ${String(spells[id]?.n ?? "Absent")} | ${enabled.join(", ") || "Aucun"} | ${[...ids].sort((a, b) => a - b).join(", ")} | ${[...deps].join(", ") || "—"} | ${[...reasons].map(([r, ranks]) => `${ranks.join(", ")} : ${r}`).join(" ; ")} |`
  );
}
function header(title: string) {
  lines.push(
    `## ${title}`,
    "",
    "| Sort | Rangs disponibles | Effets normaux et critiques | Dépendances | Rangs bloqués et motifs |",
    "| --- | --- | --- | --- | --- |"
  );
}
for (let classId = 1; classId <= 12; classId++) {
  const breed = classes[classId];
  if (!breed) {
    throw new Error(`Missing class ${classId}`);
  }
  header(breed.sn);
  for (const id of breed.s) {
    refs++;
    row(id);
  }
  lines.push("");
}
lines.splice(
  5,
  0,
  `**${refs} références de classe, ${total} rangs présents, ${available} rangs disponibles.**`,
  ""
);
header("Sorts communs et spéciaux");
for (const [id, spell] of Object.entries(spells)) {
  if (
    /^(Flamiche|Libération|Cawotte|Marteau de Moon|Boomerang perfide|Capture d'âmes|Maîtrise|Apprivoisement)/i.test(
      String(spell.n)
    )
  ) {
    row(Number(id));
  }
}
await writeFile(
  new URL("doc/combat/spell-coverage.md", root),
  `${lines.join("\n")}\n`
);
console.log(`Audited ${refs} class references plus common spells`);
