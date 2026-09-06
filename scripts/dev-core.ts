#!/usr/bin/env bun
/**
 * A core in watch mode that does **not** disconnect the clients — QA-156.
 *
 * `bun --watch` kills the process and starts it again on the same socket.
 * Nothing about that is a handoff: the gateway sees its active link die,
 * and `Upstream.invalidateSessions` hangs every session up on purpose
 * (QA-046), because the core that comes back has never heard of them. So
 * the blue/green machinery in `src/core/shared/handoff` — ten registered
 * parts, a snapshot, a restore — was only ever reachable through
 * `POST /admin/handoff`, which nobody in dev was calling. The invariant
 * CLAUDE.md states ("a core restart buffers the client's frames and
 * replays them; clients never see a disconnect") was true of the design
 * and false of the everyday `just dev`.
 *
 * This supervisor makes it true. On every change it:
 *
 *   1. starts a **second** core on the other of two socket paths;
 *   2. waits for it to accept a connection;
 *   3. asks the gateway to hand over — drain, snapshot, restore, ready;
 *   4. lets the gateway shut the old one down, and swaps the sockets.
 *
 * Two sockets, alternating, because the point of blue/green is that both
 * cores are alive at the same instant. The gateway is what moves the
 * state across; this only starts processes and asks.
 *
 * When the handoff cannot be done — no admin token, gateway down, a core
 * that will not come up — it says so out loud and falls back to the old
 * behaviour (stop, start). That is the pre-QA-156 experience, kept rather
 * than turned into a dead terminal.
 *
 * Usage: bun scripts/dev-core.ts --role game|auth
 */

import { spawn } from "node:child_process";
import { existsSync, unlinkSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";

type Role = "game" | "auth";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const SERVER_DIR = join(ROOT, "apps", "gameserver-ts");
const WATCH_DIRS = [join(SERVER_DIR, "src", "core"), join(SERVER_DIR, "src", "shared")];

/** Long enough to swallow a save-all, short enough not to feel laggy. */
const DEBOUNCE_MS = 200;
/** The gateway's own handoff budget is 10 s; give the process room first. */
const SOCKET_WAIT_MS = 15_000;

const roleArg = process.argv[process.argv.indexOf("--role") + 1];

if (roleArg !== "game" && roleArg !== "auth") {
  console.error("usage: bun scripts/dev-core.ts --role game|auth");
  process.exit(2);
}

const role: Role = roleArg;
const label = role === "game" ? "gamed" : "authd";
const socketEnvVar = role === "game" ? "CORE_SOCK" : "AUTH_SOCK";
const mode = role === "game" ? "game" : "auth";

const primarySocket =
  process.env[socketEnvVar] ?? `/tmp/dofus-${label}.sock`;
/** The other half of the pair. Both cores are up for the length of a swap. */
const alternateSocket = primarySocket.replace(/\.sock$/, "-b.sock");

const gatewayPort = Number(process.env.GATEWAY_PORT ?? 8080);
const adminToken = process.env.GATEWAY_ADMIN_TOKEN;

interface Core {
  socket: string;
  child: ReturnType<typeof spawn>;
}

let current: Core | null = null;
let swapping = false;
let pending = false;
let stopping = false;

function say(message: string): void {
  console.log(`[${label}:supervisor] ${message}`);
}

function startCore(socket: string): Core {
  // A socket file left by a core that died badly stops `Bun.listen` from
  // binding. Only remove one nobody is listening on — the alternate path
  // may still be held by the core we are replacing.
  if (existsSync(socket) && (!current || current.socket !== socket)) {
    try {
      unlinkSync(socket);
    } catch {
      // Held by something else; the core will fail to bind and say so.
    }
  }

  const child = spawn("bun", ["run", "src/core/main.ts"], {
    cwd: SERVER_DIR,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, MODE: mode, [socketEnvVar]: socket },
  });

  child.on("exit", (code, signal) => {
    // The gateway shuts a retired core down on purpose; only the one we
    // still consider current dying is news.
    if (current?.child === child && !stopping) {
      say(`core exited (${signal ?? code}) — the supervisor stops with it`);
      process.exit(code ?? 1);
    }
  });

  return { socket, child };
}

/** Resolves once something is listening on `socket`. */
async function waitForSocket(socket: string): Promise<boolean> {
  const deadline = Date.now() + SOCKET_WAIT_MS;

  while (Date.now() < deadline) {
    if (existsSync(socket)) {
      try {
        const probe = await Bun.connect({
          unix: socket,
          socket: { data() {}, error() {} },
        });
        probe.end();
        return true;
      } catch {
        // Bound but not accepting yet.
      }
    }

    await Bun.sleep(100);
  }

  return false;
}

async function askGatewayToHandOff(standbyPath: string): Promise<boolean> {
  if (!adminToken) {
    return false;
  }

  try {
    const response = await fetch(
      `http://127.0.0.1:${gatewayPort}/admin/handoff`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({ role, standbyPath }),
      }
    );

    const body = (await response.json()) as {
      ok?: boolean;
      error?: string;
      durationMs?: number;
    };

    if (response.ok && body.ok) {
      say(`handoff in ${body.durationMs} ms — no client was disconnected`);
      return true;
    }

    say(`gateway refused the handoff: ${body.error ?? response.status}`);
    return false;
  } catch (err) {
    say(`gateway unreachable for the handoff: ${(err as Error).message}`);
    return false;
  }
}

async function swap(): Promise<void> {
  if (swapping) {
    pending = true;
    return;
  }

  swapping = true;

  try {
    const previous = current;
    const nextSocket =
      previous?.socket === primarySocket ? alternateSocket : primarySocket;

    say(`change detected — starting a standby on ${nextSocket}`);
    const next = startCore(nextSocket);

    if (!(await waitForSocket(nextSocket))) {
      say("the standby never came up — keeping the core that is running");
      next.child.kill("SIGTERM");
      return;
    }

    if (previous && (await askGatewayToHandOff(nextSocket))) {
      // The gateway sends SHUTDOWN to the retired core, which raises its
      // own SIGTERM so Nest's shutdown hooks run. Nothing to kill here.
      current = next;
      return;
    }

    if (previous) {
      say("falling back to a plain restart — sessions will be closed");
      previous.child.kill("SIGTERM");
    }

    current = next;
  } finally {
    swapping = false;

    if (pending) {
      pending = false;
      void swap();
    }
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

function onChange(filename: string | null): void {
  if (!filename || !/\.(ts|tsx|json)$/.test(filename)) {
    return;
  }

  // A test file cannot change what the running core does.
  if (filename.endsWith(".spec.ts")) {
    return;
  }

  if (timer) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => {
    timer = null;
    void swap();
  }, DEBOUNCE_MS);
}

for (const dir of WATCH_DIRS) {
  if (existsSync(dir)) {
    watch(dir, { recursive: true }, (_event, filename) => onChange(filename));
  }
}

function shutdown(): void {
  stopping = true;
  current?.child.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

current = startCore(primarySocket);
say(
  `watching ${WATCH_DIRS.length} directories · sockets ${primarySocket} ⇄ ` +
    `${alternateSocket}` +
    (adminToken ? "" : " · GATEWAY_ADMIN_TOKEN unset, handoff disabled")
);
