import { createWriteStream } from "node:fs";

import pino from "pino";

import { logSink } from "./log-sink.ts";

const isDev = process.env.NODE_ENV !== "production";
const interactive = process.stdin.isTTY && !process.env.GATEWAY_LOG_STDOUT;

/**
 * Where the raw JSON journal goes.
 *
 * Set explicitly by `scripts/dev.sh` (to `$DOFUS_LOG_DIR/gateway.log`, beside
 * the other three journals) and used as before in the Ink TUI mode, where
 * stdout belongs to the interface. The file is written in **both** modes now:
 * it used to exist only under a TTY, which meant the one workflow that
 * actually needs it afterwards — `just dev` — was the one without it.
 *
 * The gateway writes this file itself rather than being tee'd like the cores,
 * because what it puts on stdout in dev is `pino-pretty` output: colourised,
 * and no fun at all to parse back.
 */
export const GATEWAY_LOG_PATH =
  process.env.GATEWAY_LOG_FILE ??
  (interactive ? "/tmp/dofus-gateway.log" : null);

// Streams:
//  - in-memory sink: always on; Ink UI reads from here.
//  - file, whenever a path is known: raw JSON — `just logs` reads this.
//  - stdout: skipped under the TUI (it owns the terminal), pretty in dev,
//    raw JSON in prod.
const streams: pino.StreamEntry[] = [{ stream: { write: logSink.write } }];

if (GATEWAY_LOG_PATH) {
  streams.push({
    stream: createWriteStream(GATEWAY_LOG_PATH, { flags: "a" }),
  });
}

if (!interactive) {
  streams.push(
    isDev
      ? {
          stream: pino.transport({
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss.l",
              ignore: "pid,hostname",
            },
          }),
        }
      : { stream: process.stdout }
  );
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    base: { component: "gateway" },
  },
  pino.multistream(streams)
);
