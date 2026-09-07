# Logging

Four processes write journals; one command puts them on a single timeline.
This document is what to read when a bug appeared during a session and you want
to know why, after the fact.

## Where the files are

`scripts/dev.sh` writes into `$DOFUS_LOG_DIR`, `/tmp/dofus-logs` by default. One
previous generation is kept (`x.log.1`) and rotated on every start.

| File | Written by | Format |
|---|---|---|
| `gateway.log` | the gateway itself, through pino | NDJSON |
| `gamed.log` | `dev.sh`, teeing the process | text, ISO-prefixed |
| `authd.log` | `dev.sh`, teeing the process | text, ISO-prefixed |
| `client.log` | **the browser**, via the Vite dev server | NDJSON |
| `vite.log` | `dev.sh`, teeing the dev server | whatever Vite prints |

`client.log` is the browser's own journal, not Vite's. The client keeps a ring
buffer of its last 2 000 entries (`src/utils/log-buffer.ts`) and POSTs it every
couple of seconds to `/__log`, a middleware on the Vite dev server
(`clientLogSinkPlugin` in `vite.config.ts`). It is a dev-server plugin rather
than a gateway route on purpose: the gateway is the production front door and
is started without watch mode because it must not restart.

## The one command

```bash
bunx just logs-bundle          # last 10 minutes
bunx just logs-bundle 30       # last 30
```

It prints the path of a single file where all five sources are interleaved by
timestamp — so a click in the browser, its validation in gamed, and the frame
that went back out read as consecutive lines. **This is the file to hand over
when reporting a bug.**

```bash
bunx just logs                 # follow all five live, prefixed and coloured
bunx just logs-clear           # wipe them
```

## Correlation

The gateway mints the `sessionId` and never sends it to the client — it is
stripped from the envelope before the WebSocket write — and no client-facing
protobuf carries a correlation field. So the join runs the other way:

1. The browser mints a short `clientId`, kept in `sessionStorage`
   (`src/utils/client-id.ts`), and hangs it off the WebSocket query string.
2. The gateway logs the pair once per connection:
   `client connected clientId=a1b2c3 sessionId=1111…`
3. Every core line carries `sid=` (and `cid=` once a character is selected),
   put there by a CLS context opened per inbound frame in `WsRouter.dispatch`.

So `grep a1b2c3` finds the connection line, and the `sessionId` on it reads the
rest of that player's session out of `gamed.log`.

## Levels

`LOG_LEVEL` (pino vocabulary: `trace` `debug` `info` `warn` `error`) is read by
the gateway **and**, since this pass, by the cores. It is already `debug` in
`.env`, which is what makes the roughly thirty `logger.debug()` calls that were
written across the core actually print — before, `main.ts` froze the level at
`["log","warn","error"]` and they produced nothing.

The client keeps everything in its ring buffer whatever the console shows.
The console shows `info` and above by default; `debug` appears there once a
trace channel is armed. `debug` no longer goes through `console.debug`, which
Chrome hides behind its "Verbose" filter.

## Trace channels — the verbose mode

Five channels, all off by default, because each one logs on a hot path and
leaving one on costs frames:

| Channel | What it logs |
|---|---|
| `net` | every frame in and out, by payload case |
| `move` | walk animation, step by step |
| `pick` | hit-testing |
| `render` | render pipeline detail |
| `machines` | verbose XState detail |

Three ways to arm them, all dev-build only:

```
http://localhost:5173/?trace=net,move     URL, remembered across reloads
window.__trace("net,move")                console
window.__trace(false)                     off
```

…or the **Trace** buttons in the performance card, in the letterbox gutter
beside the canvas.

What keeps an unarmed channel free is the call shape:

```ts
log.trace("net", () => `→ ${describeClientFrame(data)}`);
```

The thunk is not evaluated unless the channel is armed. This matters: the
ordinary `log.debug(`…${x}…`)` builds its message *before* the logger can
decide to drop it, which is fine a few times per click and not fine per frame.
A spec pins this (`src/utils/logger.spec.ts`) — if it ever fails, the hot-path
instrumentation has become expensive again.

Server side, `TRACE_FRAMES=1` does the same for the gateway's frame trace,
inbound and outbound. Off by default: during a fight it is hundreds of lines a
second.

## Other console handles

All dev-build only:

```
__dumpLogs()     the ring buffer, oldest first
__flushLogs()    push it to client.log now, without waiting for the timer
__clearLogs()    drop the history
__clientId()     this tab's correlation id
```

## What the movement path logs

The walk is the best-instrumented path, because it is where the bugs that
prompted this pass live. In order, for one click:

```
client   cell-click cell=268 fightMode=none
client   Moving: 153 → 268
client   move sent=true 4 step(s) 153 → 268 path=[153,168,183,198,268]
gamed    move ok action=3 153 → 268 4 step(s) truncated=false map=7411 …
client   walk start seq=3 map=7411 4 step(s) 153 → 268 path=[…]
client   walk end seq=3 map=7411 cell=268 interrupted=false
gamed    ack 3 committed cell=268 dir=1 map=7411 isAck=true
```

Lines that mean something went wrong:

| Line | What it means |
|---|---|
| `cell-click dropped: …` | the click was swallowed — no pathfinding yet, or no route |
| `move dropped: …` (gamed) | the server refused: no character, an exchange, or a harvest |
| `send queued (socket …)` | the frame never left; the client thinks it is walking |
| `self-move timed out after 2000 ms` | no echo came back; two seconds of dead clicks |
| `truncated=true` | an unwalkable step cut the walk short server-side |
| `walk finished on a different map than it started` | a map change landed mid-animation — the landing cell and the ack belong to the old map |
| `ack: id mismatch` | the ack named a move the server had already replaced |
| `move cancel: cell N is not on the authorised path` | the client claimed a stop the server would not accept |

The last three are the signature of a character that walks somewhere odd and
then stops answering clicks.

## Where the code is

| Concern | File |
|---|---|
| Client logger and ring buffer | `apps/electrobun/src/utils/logger.ts`, `log-buffer.ts` |
| Trace channels | `apps/electrobun/src/utils/trace.ts` |
| Shipping to disk | `apps/electrobun/src/utils/log-shipper.ts`, `vite.config.ts` |
| Console handles | `apps/electrobun/src/utils/devtools.ts` |
| Machine transitions | `apps/electrobun/src/game/machines/trace-inspector.ts` |
| Core logger | `apps/gameserver-ts/src/core/shared/logging/core-logger.ts` |
| Core correlation | `.../logging/core-log-context.ts`, `.../gateway-adapter/ws-router.ts` |
| Gateway logger | `apps/gameserver-ts/src/gateway/logger.ts` |
| Bundling | `scripts/logs.ts`, `scripts/dev.sh` |
