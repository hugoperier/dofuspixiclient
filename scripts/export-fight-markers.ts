import { compileStatic } from "@dofus/dofasset-format/pipeline";
import { join } from "node:path";

const source = process.argv[2];
if (!source) throw new Error("Usage: bun scripts/export-fight-markers.ts <retail-client/clips/sprites>");
const output = join(import.meta.dir, "../apps/electrobun/public/assets/fight-markers");
const command = Bun.spawnSync(["php", join(import.meta.dir, "export-fight-markers.php"), source, output], { stdout: "inherit", stderr: "inherit" });
if (command.exitCode !== 0) process.exit(command.exitCode);
for (const id of [0, 3]) for (const layer of ["art", "circle"]) {
  const path = join(output, `${id}-${layer}`);
  const { bytes, stats } = compileStatic(await Bun.file(`${path}.svg`).text(), { assetId: id });
  if (!stats.drawCommands) throw new Error(`Empty marker: ${path}`);
  await Bun.write(`${path}.dofasset`, bytes);
  console.log(`${id}-${layer}: ${stats.drawCommands} draws, ${stats.images} images`);
}
