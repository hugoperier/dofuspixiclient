import { readFile, writeFile } from "node:fs/promises";

import {
  readAnimations,
  readSpellExtras,
} from "../../../packages/dofasset-format/src";
import { combatRegistry } from "../src/core/modules/fight/effects/combat-test-harness";
import { combatCatalog } from "../src/core/modules/spells/combat-catalog";
import { prepareCombatData } from "../src/core/modules/spells/combat-dependencies";

const root = new URL("../../../", import.meta.url);
const classes = JSON.parse(
  await readFile(new URL("assets/dist/langs/fr/classes.json", root), "utf8")
).data.G as Record<string, { sn: string }>;
const registry = combatRegistry();
type PresentationAudit = {
  id: number;
  sha256: string;
  moduleSha256: string;
  missing: string[];
  failures: string[];
  cases: number;
};
const presentationFile = Bun.file(
  new URL("doc/combat/animation-audit.json", root)
);
const presentation: { graphics: PresentationAudit[] } =
  (await presentationFile.exists())
    ? await presentationFile.json()
    : { graphics: [] };
const port = {
  spellLevel: async (id: number, rank: number) =>
    combatCatalog.levels[`${id}:${rank}`],
  summonTemplate: async (id: number, rank: number) =>
    combatCatalog.summons[`${id}:${rank}`],
};
const verify = process.argv.includes("--verify");
let testResult = "Non relancés par cet audit";
if (verify) {
  const run = Bun.spawn(
    [
      "bun",
      "test",
      "./src/core/modules/fight",
      "./src/core/modules/spells",
      "--timeout",
      "30000",
    ],
    {
      cwd: new URL("../", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
    run.exited,
  ]);
  await writeFile(
    new URL("doc/combat/mechanical-tests.log", root),
    stdout + stderr
  );
  if (code !== 0) {
    throw new Error(
      "Tests mécaniques en échec : voir doc/combat/mechanical-tests.log"
    );
  }
  testResult = (
    stderr.match(/\d+ pass\s+\d+ fail/)?.[0] ?? "Tests réussis"
  ).replace(/\s+/g, " ");
}
type AssetCheck = {
  category: "spells" | "sprites";
  id: number;
  error: string;
  sha256: string;
  scriptRequired?: boolean;
};
const assetChecks = new Map<string, Promise<AssetCheck>>();
function inspectAsset(
  category: AssetCheck["category"],
  id: number
): Promise<AssetCheck> {
  const key = `${category}:${id}`;
  const existing = assetChecks.get(key);
  if (existing) {
    return existing;
  }
  const pending = (async () => {
    const result: AssetCheck = { category, id, error: "", sha256: "" };
    try {
      const bytes = new Uint8Array(
        await Bun.file(
          new URL(
            `apps/electrobun/public/assets/spritesheets/${category}/${id}.dofasset`,
            root
          )
        ).arrayBuffer()
      );
      if (new TextDecoder().decode(bytes.subarray(0, 4)) !== "DASF") {
        throw new Error("Binaire DASF invalide");
      }
      result.sha256 = new Bun.CryptoHasher("sha256")
        .update(bytes)
        .digest("hex");
      if (category === "spells") {
        const extras = readSpellExtras(bytes);
        if (!extras || !Object.keys(extras.animations).length) {
          throw new Error("Animations ou métadonnées absentes");
        }
        const animations = readAnimations(bytes);
        if (
          !animations.length ||
          animations.some(
            (animation) => !animation.frameIds.length || animation.fps <= 0
          )
        ) {
          throw new Error("Table d’animations compilées vide ou invalide");
        }
        const compiled = new Set(animations.map((animation) => animation.name));
        for (const name of Object.keys(extras.animations)) {
          if (!compiled.has(name)) {
            throw new Error(`Animation déclarée mais non compilée : ${name}`);
          }
        }
        result.scriptRequired = extras.requiresTypeScript;
        if (
          extras.requiresTypeScript &&
          !(await Bun.file(
            new URL(`apps/electrobun/src/game/spells/spell-${id}.ts`, root)
          ).exists())
        ) {
          throw new Error("Script graphique requis absent");
        }
        const execution = presentation.graphics.find(
          (graphic) => graphic.id === id
        );
        const moduleBytes = await Bun.file(
          new URL(
            extras.requiresTypeScript
              ? `apps/electrobun/src/game/spells/spell-${id}.ts`
              : "apps/electrobun/src/game/scene/fight/pre-rendered-spell.ts",
            root
          )
        ).arrayBuffer();
        const moduleSha256 = new Bun.CryptoHasher("sha256")
          .update(moduleBytes)
          .digest("hex");
        if (
          !execution ||
          execution.sha256 !== result.sha256 ||
          execution.moduleSha256 !== moduleSha256
        ) {
          throw new Error(
            "Audit du module absent ou périmé : relancer apps/electrobun/scripts/audit-spell-animations.ts"
          );
        }
        if (execution.missing.length || execution.failures.length) {
          throw new Error(
            [
              execution.missing.length
                ? `Symboles absents : ${execution.missing.join(", ")}`
                : "",
              execution.failures.length
                ? `${execution.failures.length} scénarios de terminaison en échec`
                : "",
            ]
              .filter(Boolean)
              .join("; ")
          );
        }
      }
    } catch (error) {
      result.error = `${category}/${id}: ${String(error)}`;
    }
    return result;
  })();
  assetChecks.set(key, pending);
  return pending;
}
type Row = {
  classId: number;
  spellId: number;
  name: string;
  ranks: {
    rank: number;
    reason: string;
    dependencies: string[];
    summons: string[];
    visual: string;
    assets: string[];
  }[];
};
const rows: Row[] = [];
for (const ref of combatCatalog.roots) {
  const row: Row = {
    ...ref,
    name: combatCatalog.names[ref.spellId] ?? String(ref.spellId),
    ranks: [],
  };
  for (let rank = 1; rank <= 6; rank++) {
    const spell = combatCatalog.levels[`${ref.spellId}:${rank}`];
    if (!spell) {
      throw new Error(`Rang absent ${ref.spellId}:${rank}`);
    }
    const ready = await prepareCombatData(spell, port, (id) =>
      Boolean(registry.handler(id))
    );
    const graphics = new Set(
      [...ready.spells.values()]
        .map((value) => value.visualGfxId)
        .filter((id) => id > 0)
    );
    const sprites = new Set(
      [...ready.summons.values()].map((value) => value.gfx)
    );
    for (const level of ready.spells.values()) {
      for (const effect of [...level.effects, ...level.criticalEffects]) {
        if (effect.id === 149 && effect.special > 0) {
          sprites.add(effect.special);
        }
        if (level.spellId === 686) {
          sprites.add(8011);
        }
        if (effect.id === 180) {
          sprites.add(ref.classId * 10);
          sprites.add(ref.classId * 10 + 1);
        }
      }
    }
    const checked = await Promise.all(
      [...graphics]
        .map((id) => inspectAsset("spells", id))
        .concat([...sprites].map((id) => inspectAsset("sprites", id)))
    );
    const failures = checked.filter((asset) => asset.error);
    const visual = failures.length
      ? failures.map((asset) => asset.error).join("; ")
      : `${graphics.size} graphiques et ${sprites.size} sprites contrôlés${spell.visualGfxId <= 0 ? "; pose / effets synchronisés" : ""}`;
    row.ranks.push({
      rank,
      reason: ready.reason,
      dependencies: [...ready.spells.keys()].filter(
        (key) => key !== `${ref.spellId}:${rank}`
      ),
      summons: [...ready.summons.keys()],
      visual,
      assets: checked.map((asset) => `${asset.category}:${asset.id}`),
    });
  }
  rows.push(row);
}
const lines = [
  "# Couverture des sorts des douze classes Retro",
  "",
  "264 sorts de classe (252 sorts de tableaux et douze spéciaux), 1 584 rangs racines. Les sorts communs, maîtrises, armes et acquisition des spéciaux sont hors périmètre.",
  "",
  `Le graphe exact comprend **${Object.keys(combatCatalog.levels).length} rangs** et **${Object.keys(combatCatalog.summons).length} grades d'invocation**. Résolution commune avec le serveur et le grimoire : ` +
    "`prepareCombatData`.",
  "",
  `Tests : **${testResult}**. L'exécution contrôlée normale/critique et les interactions ont des tests distincts. La présence d'un handler et d'un asset ne certifie pas à elle seule la conformité mécanique ni le rendu.`,
  "",
  "Les preuves navigateur sont séparées et restent à produire pour les 264 sorts. Aucune ligne ci-dessous n'est certifiée visuellement par cet audit. Voir [règles et sources](retro-rules.md).",
  "Les tables compilées et les appels des modules sont contrôlés séparément des pixels affichés : [audit des 145 graphiques](animation-audit.json), [vérification des régressions](regression-validation.md). Un symbole absent est un échec même si la timeline atteint sa fin.",
  "",
];
for (let classId = 1; classId <= 12; classId++) {
  lines.push(
    `## ${classes[classId]?.sn ?? classId}`,
    "",
    "| Sort | Rangs préparés | Dépendances exactes (sorts / grades) | Exécution mécanique | Audit des assets | Validation visuelle |",
    "| --- | --- | --- | --- | --- | --- |"
  );
  for (const row of rows.filter((r) => r.classId === classId)) {
    const available = row.ranks.filter((r) => !r.reason).map((r) => r.rank);
    const dependencies = [...new Set(row.ranks.flatMap((r) => r.dependencies))];
    const summons = [...new Set(row.ranks.flatMap((r) => r.summons))];
    const reasons = [
      ...new Set(row.ranks.map((r) => r.reason).filter(Boolean)),
    ];
    lines.push(
      `| ${row.spellId} — ${row.name} | ${available.join(", ")} | ${dependencies.join(", ") || "—"} / ${summons.join(", ") || "—"} | ${reasons.join("; ") || (verify ? "Normale/critique testées" : "Tests non relancés")} | ${[...new Set(row.ranks.map((r) => r.visual))].join("; ")} | Non vérifiée |`
    );
  }
  lines.push("");
}
await writeFile(
  new URL("doc/combat/spell-coverage.md", root),
  lines.join("\n").trimEnd() + "\n"
);
const checkedAssets = await Promise.all(assetChecks.values());
// Small client index; the authoritative dependency graph remains server-side.
await writeFile(
  new URL("apps/electrobun/src/game/assets/combat-spell-graphics.json", root),
  JSON.stringify(
    Object.fromEntries(
      rows.map((row) => [
        String(row.spellId),
        [
          ...new Set(
            row.ranks
              .flatMap((rank) => rank.assets)
              .filter((asset) => asset.startsWith("spells:"))
              .map((asset) => Number(asset.slice(7)))
          ),
        ].sort((a, b) => a - b),
      ])
    ),
    null,
    2
  ) + "\n"
);
await writeFile(
  new URL("doc/combat/spell-coverage.json", root),
  JSON.stringify(
    {
      testResult,
      verifiedMechanics: verify,
      visualVerified: false,
      sources: combatCatalog.sources,
      assets: checkedAssets,
      rows,
    },
    null,
    2
  ) + "\n"
);
console.log(
  `Audited ${rows.length} spells, ${rows.reduce((sum, r) => sum + r.ranks.length, 0)} ranks; ${testResult}`
);
for (const asset of checkedAssets) {
  if (asset.error) {
    console.error(asset.error);
  }
}
if (checkedAssets.some((asset) => asset.error)) {
  process.exitCode = 1;
}
