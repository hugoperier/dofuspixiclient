#!/usr/bin/env bun
/**
 * Post-traitement des tuiles de carte du monde produites par
 * `tools/worldmap-exporter` (ExportWorldMapTilesCommand.php).
 *
 *   just worldmap-optimize
 *
 * L'exporteur découpe le SWF en une grille pleine : pour Amakna, 32×32 tuiles
 * de 256 px, dont **754 sur 1024 sont d'une seule couleur** — le parchemin
 * autour du continent (`e4e5b7`) et le gris des trous (`7f7f7f`). Le client les
 * téléchargeait et les décodait quand même : 1024 requêtes et 1024 textures de
 * 256×256 uploadées en une frame, pour n'afficher que deux teintes.
 *
 * Ce script relit les `.webp` déjà présents — il ne touche pas aux SWF, donc il
 * tourne sur un clone frais contrairement au reste du pipeline d'assets — et
 * écrit un manifeste à trois niveaux de détail :
 *
 *   overview.webp   la planche entière en 1/4 de résolution, une requête, que
 *                   le renderer peint immédiatement et garde comme LOD de
 *                   dézoom ;
 *   uniform_tiles   les tuiles unies, groupées par couleur — le renderer en
 *                   fait des rectangles pleins, sans requête ni texture, et le
 *                   rendu reste exact au pixel ;
 *   tiles           ce qui reste, chargé à la demande selon le viewport.
 *
 * Les fichiers des tuiles unies ne sont pas supprimés : ils ne pèsent que
 * 194 octets pièce et les garder rend l'opération réversible. Seul le
 * manifeste décide de ce qui est chargé.
 *
 * Idempotent : la liste des tuiles est reconstruite depuis le disque, pas
 * depuis le manifeste, donc deux exécutions successives produisent le même
 * fichier octet pour octet.
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

const WORLD_ROOT = "apps/electrobun/public/assets/maps/world";

/** Côté max de l'aperçu. La planche d'Amakna fait 8192 px, soit 1/4. */
const MAX_OVERVIEW_SIZE = 2048;

/** Nombre de `stats()` en vol. Au-delà, sharp sature sans aller plus vite. */
const SCAN_CONCURRENCY = 24;

interface Tile {
  x: number;
  y: number;
  file: string;
}

interface Manifest {
  worldmap: string;
  grid_size: number;
  tile_size: number;
  format: string;
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number };
  overview?: string;
  overview_size?: number;
  /** Couleur hexadécimale sans `#` -> coordonnées de tuiles de cette couleur. */
  uniform_tiles?: Record<string, Array<[number, number]>>;
  tiles: Tile[];
}

const TILE_NAME = /^tile_(\d+)_(\d+)\.webp$/;

interface Scanned {
  x: number;
  y: number;
  file: string;
  /** Couleur si la tuile est unie, `null` si elle porte du détail. */
  uniform: string | null;
}

/**
 * Une tuile est « unie » quand chaque canal a le même minimum et le même
 * maximum. On ne se fie pas à la taille du fichier : 194 octets est un très bon
 * indice, mais l'encodeur ne garantit rien.
 *
 * L'aperçu redimensionne chaque tuile indépendamment, sans mélange entre
 * voisines, donc une tuile unie y reste un bloc de la même teinte — et le
 * renderer la redessine de toute façon en rectangle plein depuis cette valeur.
 */
async function scanTile(dir: string, file: string): Promise<Scanned | null> {
  const match = TILE_NAME.exec(file);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  const stats = await sharp(join(dir, file)).stats();
  const isUniform = stats.channels.every((c) => c.min === c.max);
  const rgb = stats.channels.slice(0, 3);

  return {
    x: Number.parseInt(match[1], 10),
    y: Number.parseInt(match[2], 10),
    file,
    uniform: isUniform
      ? rgb.map((c) => c.min.toString(16).padStart(2, "0")).join("")
      : null,
  };
}

/** `Promise.all` borné, pour ne pas ouvrir 1024 descripteurs d'un coup. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (next < items.length) {
        const index = next++;
        const item = items[index];

        if (item !== undefined) {
          out[index] = await fn(item);
        }
      }
    })()
  );

  await Promise.all(workers);
  return out;
}

async function totalBytes(dir: string, files: string[]): Promise<number> {
  const sizes = await mapLimit(files, SCAN_CONCURRENCY, async (file) =>
    (await stat(join(dir, file))).size
  );

  return sizes.reduce((a, b) => a + b, 0);
}

async function optimizeWorld(name: string): Promise<void> {
  const dir = join(WORLD_ROOT, name);
  const manifestPath = join(dir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;

  const entries = await readdir(dir);
  const files = entries.filter((f) => TILE_NAME.test(f)).sort();

  const scanned = (
    await mapLimit(files, SCAN_CONCURRENCY, (file) => scanTile(dir, file))
  ).filter((t): t is Scanned => t !== null);

  // Ordre canonique : deux exécutions doivent donner le même octet.
  scanned.sort((a, b) => a.y - b.y || a.x - b.x);

  const detail = scanned.filter((t) => t.uniform === null);
  const uniform: Record<string, Array<[number, number]>> = {};

  for (const tile of scanned) {
    if (tile.uniform === null) {
      continue;
    }

    (uniform[tile.uniform] ??= []).push([tile.x, tile.y]);
  }

  // ── Aperçu ────────────────────────────────────────────────────────────────
  // Toutes les tuiles y participent, unies comprises : c'est le LOD de dézoom,
  // il doit montrer la planche complète en une seule requête.
  const planeSize = manifest.grid_size * manifest.tile_size;
  const overviewSize = Math.min(MAX_OVERVIEW_SIZE, planeSize);
  const cell = Math.round(overviewSize / manifest.grid_size);
  const side = cell * manifest.grid_size;

  const composites = await mapLimit(scanned, SCAN_CONCURRENCY, async (tile) => ({
    input: await sharp(join(dir, tile.file))
      .resize(cell, cell, { fit: "fill" })
      .toBuffer(),
    left: tile.x * cell,
    top: tile.y * cell,
  }));

  await sharp({
    create: {
      width: side,
      height: side,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ quality: 82 })
    .toFile(join(dir, "overview.webp"));

  // ── Manifeste ─────────────────────────────────────────────────────────────
  const sortedUniform: Record<string, Array<[number, number]>> = {};

  for (const key of Object.keys(uniform).sort()) {
    const cells = uniform[key];

    if (cells) {
      sortedUniform[key] = cells;
    }
  }

  const next: Manifest = {
    worldmap: manifest.worldmap,
    grid_size: manifest.grid_size,
    tile_size: manifest.tile_size,
    format: manifest.format,
    bounds: manifest.bounds,
    overview: "overview.webp",
    overview_size: side,
    uniform_tiles: sortedUniform,
    tiles: detail.map(({ x, y, file }) => ({ x, y, file })),
  };

  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  const before = await totalBytes(dir, files);
  const after = await totalBytes(dir, detail.map((t) => t.file));
  const overviewBytes = (await stat(join(dir, "overview.webp"))).size;

  console.log(
    [
      `${name}: ${detail.length}/${scanned.length} tuiles de détail`,
      `(${scanned.length - detail.length} unies en ${Object.keys(sortedUniform).length} couleurs),`,
      `${(before / 1024).toFixed(0)} Ko -> ${(after / 1024).toFixed(0)} Ko`,
      `+ aperçu ${side}x${side} ${(overviewBytes / 1024).toFixed(0)} Ko`,
    ].join(" ")
  );
}

const worlds = (await readdir(WORLD_ROOT, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

for (const world of worlds) {
  await optimizeWorld(world);
}
