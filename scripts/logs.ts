#!/usr/bin/env bun
/**
 * Reads the journals `just dev` and the client leave behind.
 *
 *   just logs                 suit les quatre en direct
 *   just logs-bundle [min]    fusionne les N dernières minutes en un fichier
 *
 * Le fichier produit par `logs-bundle` est ce qu'on transmet quand un bug est
 * apparu en session : les quatre sources y sont triées par horodatage, donc un
 * clic côté navigateur et sa validation côté serveur se lisent à la suite.
 *
 * Trois formats cohabitent, parce que les trois producteurs sont différents et
 * qu'aucun n'avait de raison de changer :
 *
 *   client.log   NDJSON du ring buffer navigateur (`src/utils/log-buffer.ts`)
 *   gateway.log  NDJSON pino
 *   gamed/authd  texte préfixé ISO (`shared/logging/core-logger.ts`)
 *   vite.log     texte quelconque — pris tel quel, rattaché à l'heure du fichier
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const LOG_DIR = process.env.DOFUS_LOG_DIR ?? "/tmp/dofus-logs";

/** Ordre d'affichage, et couleur du préfixe — les mêmes que `dev.sh`. */
const SOURCES = [
  { name: "gateway", file: "gateway.log", color: "\u001b[32m" },
  { name: "gamed", file: "gamed.log", color: "\u001b[34m" },
  { name: "authd", file: "authd.log", color: "\u001b[35m" },
  { name: "client", file: "client.log", color: "\u001b[36m" },
  { name: "vite", file: "vite.log", color: "\u001b[33m" },
] as const;

const RESET = "\u001b[0m";

/** Niveaux pino, pour retraduire `level: 30` en `INFO`. */
const PINO_LEVELS: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO ",
  40: "WARN ",
  50: "ERROR",
  60: "FATAL",
};

export interface ParsedLine {
  /** Epoch ms, ou `null` quand la ligne n'en porte pas. */
  t: number | null;
  source: string;
  text: string;
}

/** `2026-09-07T10:11:12.345Z INFO  [MoveHandler] sid=… message` */
const ISO_PREFIX = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+(.*)$/;

export function parseLine(source: string, line: string): ParsedLine | null {
  const trimmed = line.trimEnd();

  if (trimmed.length === 0) {
    return null;
  }

  // NDJSON — navigateur ou pino.
  if (trimmed.startsWith("{")) {
    try {
      const obj: unknown = JSON.parse(trimmed);

      if (typeof obj === "object" && obj !== null) {
        const record = obj as Record<string, unknown>;

        // Ring buffer navigateur.
        if (typeof record.t === "number" && typeof record.msg === "string") {
          const level = String(record.level ?? "info").toUpperCase();
          const tag = String(record.tag ?? "?");
          const args = Array.isArray(record.args)
            ? ` ${record.args.join(" ")}`
            : "";

          return {
            t: record.t,
            source,
            text: `${level.padEnd(5)} [${tag}] ${record.msg}${args}`,
          };
        }

        // pino.
        if (typeof record.time === "number") {
          const level =
            PINO_LEVELS[Number(record.level)] ?? String(record.level);
          const mod = record.mod === undefined ? "" : `[${record.mod}] `;
          const extra = Object.entries(record)
            .filter(
              ([key]) =>
                ![
                  "time",
                  "level",
                  "msg",
                  "mod",
                  "component",
                  "pid",
                  "hostname",
                ].includes(key)
            )
            .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
            .join(" ");

          return {
            t: record.time,
            source,
            text: `${level} ${mod}${record.msg ?? ""}${
              extra.length > 0 ? ` ${extra}` : ""
            }`,
          };
        }
      }
    } catch {
      // Pas du JSON après tout — on retombe sur le texte brut.
    }
  }

  // Texte préfixé ISO — les cores.
  const iso = ISO_PREFIX.exec(trimmed);

  if (iso?.[1] !== undefined && iso[2] !== undefined) {
    return { t: Date.parse(iso[1]), source, text: iso[2] };
  }

  return { t: null, source, text: trimmed };
}

/**
 * Une ligne sans horodatage hérite de la précédente.
 *
 * C'est le cas d'une trace d'exception, d'une bannière Vite, de tout ce qu'un
 * processus écrit sans passer par son logger. Les rattacher garde le bloc
 * ensemble au tri, au lieu de l'éparpiller en tête de fichier.
 */
export function parseFile(source: string, content: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  let lastT: number | null = null;

  for (const line of content.split("\n")) {
    const parsed = parseLine(source, line);

    if (parsed === null) {
      continue;
    }

    if (parsed.t === null) {
      parsed.t = lastT;
    } else {
      lastT = parsed.t;
    }

    out.push(parsed);
  }

  return out;
}

function color(source: string): string {
  return SOURCES.find((s) => s.name === source)?.color ?? "";
}

function render(entry: ParsedLine, colorize: boolean): string {
  const stamp =
    entry.t === null
      ? "                        "
      : new Date(entry.t).toISOString();

  if (!colorize) {
    return `${stamp} ${entry.source.padEnd(7)} ${entry.text}`;
  }

  return `${stamp} ${color(entry.source)}${entry.source.padEnd(7)}${RESET} ${entry.text}`;
}

async function bundle(minutes: number): Promise<void> {
  const since = Date.now() - minutes * 60_000;
  const entries: ParsedLine[] = [];

  for (const { name, file } of SOURCES) {
    const path = join(LOG_DIR, file);

    if (!existsSync(path)) {
      continue;
    }

    const content = await readFile(path, "utf-8");

    for (const entry of parseFile(name, content)) {
      // Une ligne sans horodatage du tout (fichier qui n'en produit aucun)
      // est gardée : mieux vaut du contexte non daté que rien.
      if (entry.t === null || entry.t >= since) {
        entries.push(entry);
      }
    }
  }

  // Tri stable : à horodatage égal, l'ordre de lecture est conservé, ce qui
  // garde une trace d'exception derrière la ligne qui l'a produite.
  entries.sort((a, b) => (a.t ?? 0) - (b.t ?? 0));

  mkdirSync(LOG_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = join(LOG_DIR, `bundle-${stamp}.log`);
  const header = [
    `# dofus session bundle — ${new Date().toISOString()}`,
    `# ${minutes} dernières minutes, ${entries.length} lignes`,
    `# sources: ${SOURCES.map((s) => s.name).join(", ")}`,
    "",
  ].join("\n");

  await writeFile(
    out,
    header + entries.map((e) => render(e, false)).join("\n") + "\n",
    "utf-8"
  );

  console.log(out);
}

/**
 * Suit les fichiers. Réimplémenté plutôt que délégué à `tail -f` parce qu'il
 * faut préfixer chaque ligne par sa source et traiter les trois formats.
 */
async function follow(): Promise<void> {
  const offsets = new Map<string, number>();

  for (const { name, file } of SOURCES) {
    const path = join(LOG_DIR, file);
    offsets.set(name, existsSync(path) ? statSync(path).size : 0);
  }

  console.log(`suivi de ${LOG_DIR} — Ctrl-C pour arrêter`);

  for (;;) {
    for (const { name, file } of SOURCES) {
      const path = join(LOG_DIR, file);

      if (!existsSync(path)) {
        continue;
      }

      const size = statSync(path).size;
      const from = offsets.get(name) ?? 0;

      // Fichier tronqué (rotation d'un nouveau `just dev`) : on repart de zéro.
      if (size < from) {
        offsets.set(name, 0);
        continue;
      }

      if (size === from) {
        continue;
      }

      const content = await readFile(path, "utf-8");

      for (const entry of parseFile(name, content.slice(from))) {
        console.log(render(entry, true));
      }

      offsets.set(name, size);
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--follow")) {
    await follow();
    return;
  }

  const idx = args.indexOf("--bundle");

  if (idx !== -1) {
    const raw = args[idx + 1];
    const minutes = raw === undefined ? 10 : Number.parseInt(raw, 10);

    await bundle(Number.isFinite(minutes) && minutes > 0 ? minutes : 10);
    return;
  }

  console.error("usage: logs.ts --follow | --bundle <minutes>");
  process.exit(2);
}

// Importé par son spec sans exécuter la commande.
if (import.meta.main) {
  await main();
}
