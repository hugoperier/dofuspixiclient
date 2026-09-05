# Admin commands

In-game game-master tooling: a right-hand drawer in the HUD and a set of chat
slash commands, both talking to one server feature slice
(`apps/gameserver-ts/src/core/features/game/admin/`) over three protobuf
messages. Every accepted request is written to `admin_command_audit` before its
result reaches the client, and the `request_id` is the table's primary key —
which is also what makes a command replay-safe.

The authority is `accounts.is_admin` (a `boolean` since migration `0001`), read
from the database on **every** request. The client never decides anything: the
`AdminCapabilities` frame only decides whether the UI is drawn.

## Two surfaces, one path

```
HUD drawer  ─┐                      ┌─ AdminCommandRequest  (ClientMessage 521)
             ├─ AdminHandler (client)┤
chat /tp …  ─┘                      └─ AdminPlayerSearchRequest (520)
                                              │
                                    gateway → gamed
                                              ▼
                             AdminHandler → AdminService → AdminRepository
                                              │
                    ┌─────────────────────────┼──────────────────────────┐
                    ▼                         ▼                          ▼
          admin_command_audit          players / items          live refresh frames
                                                              (stats, spells, item, teleport)
```

`source` travels with the request (`DRAWER` or `CHAT`) and comes back on the
response: the client routes drawer results to the activity list and chat results
to the chat log, and the server uses it to decide whether a confirmation step is
required.

### Drawer

- `Ctrl+Shift+A` (`ADMIN` shortcut, `hud/core/keybindings.ts`), `/admin`, or
  **Administrer ce joueur** in the right-click menu on another player — that
  entry only appears when `adminStore.enabled` is true. `Escape` closes it.
- Search by name fragment or `#ID`, a **Moi** button targets your own character.
- Target card shows account, online status, position, level, kamas, XP and both
  capitals; the panel keeps the last 50 responses (8 shown).
- The item picker is fed by the **crafts lang bundle** and the map picker by the
  **maps lang bundle** — an item or map missing from those bundles cannot be
  picked in the drawer, but its raw id still works from chat.
- Sensitive actions open a confirm sheet (see [Confirmation](#confirmation)).

### Chat

Parsed client-side in `apps/electrobun/src/game/chat/chat-commands.ts` before
the channel commands, so these names shadow nothing existing. A malformed
command answers with a local syntax error and never hits the wire.

| Command | Syntax |
|---|---|
| `/admin` | open the drawer |
| `/admin help` | print the command list in chat |
| `/admin find <nom\|#ID>` | search, results printed in chat |
| `/tp` | `/tp to <cible>` · `/tp here <cible>` · `/tp map <cible> <mapId> <cellId>` |
| `/give` | `/give <cible> <itemId> [quantité=1] [normal\|perfect\|empty]` |
| `/kamas` | `/kamas <cible> <add\|remove\|set> <montant>` |
| `/xp` | `/xp <cible> <add\|remove\|set> <montant>` |
| `/capital` | `/capital <cible> <stats\|spells> <add\|remove\|set> <montant>` |
| `/level` | `/level <cible> <niveau>` |
| `/restore` | `/restore <cible> <life\|energy\|all>` |
| `/heal` | `/heal <cible>` — alias for `/restore <cible> life` |

`<cible>` is `me` (→ `self`), `#<playerId>`, or a character name. A name is
resolved case-insensitively and **must be unique**: two matches answer
"Nom ambigu : utilisez le #ID du personnage."

Chat commands are sent with `confirmed: true` — typing the command *is* the
confirmation, so there is no second prompt. The drawer is the surface that
prompts.

## What each command does

| Command | Effect | Guardrails |
|---|---|---|
| `teleport SELF_TO_TARGET` | moves **you** to the target's map/cell | refuses when you are the target |
| `teleport TARGET_TO_SELF` | pulls the target to your map/cell | destination cell must exist, be active and walkable |
| `teleport TARGET_TO_MAP` | moves the target to `mapId`/`cellId` | same cell validation, map must be loadable |
| `grantItem` | inserts `quantity` of `itemId` through the shared item-grant path | template must exist; `1 ≤ quantity ≤ 1 000 000` |
| `changeResource KAMAS/XP` | add / remove / set, amount as a **decimal string** | result in `[0, 2^63-1]`; XP also reconciles level |
| `changeResource STAT_POINTS/SPELL_POINTS` | add / remove / set capitals | result in `[0, 2^31-1]` |
| `setLevel` | sets level **and** the XP floor for it | `1 ≤ level ≤ 200` (`MAX_LEVEL`); see reconciliation below |
| `restore LIFE/ENERGY/ALL` | life to `maxLifePoints(level, vitality+equipment)`, energy to `ENERGY_MAX` | — |

Item rolls: `normal` uses the usual random roll, `perfect` fixes every genuine
ranged jet to its template maximum (`perfectItemEffects`, added here next to
`rollItemEffects`), `empty` writes a single marker effect (`param3:
"admin-empty"`) — an item with no stats.

### Level and XP reconciliation

`setLevel`, and any XP change that crosses a level boundary, go through the same
`reconcileLevel`: it recomputes the expected capitals with `expectedCapital()`,
deletes class spells above the new level, re-learns the class spells up to it,
and writes level + experience + both capitals in one transaction.

A downgrade is **refused** — and nothing is written — when:

- a spell that would be removed has been upgraded past level 1, or
- the points already spent exceed the capital of the new level
  (`capital.statsPoints < 0 || capital.spellPoints < 0`).

## Confirmation

`requiresConfirmation()` (server) marks an action sensitive when it is a
teleport of somebody else, a `remove`/`set` on a resource, or a level
*decrease*. From the drawer, the first request is answered
`CONFIRMATION_REQUIRED` with a `before` snapshot and an audit row in state
`confirmation_required` — nothing has been mutated. The client re-sends **the
same `request_id`** with `confirmed: true`.

The second request must carry the same target and command: the server compares a
fingerprint of the stored parameters against the new ones and answers
`FORBIDDEN` — "La commande confirmée ne correspond pas à la demande initiale" —
on any mismatch. A confirmation cannot be swapped for a different command.

## Replay, idempotency and audit

`request_id` is the primary key of `admin_command_audit`, so:

- a completed request re-sent with the same id returns the **stored** result and
  applies nothing;
- a request id already used by another account answers `FORBIDDEN`;
- a `request_id` that is not a UUID, or an unknown `source`, is rejected as
  `ERROR` (and audited).

The audit row carries `actor_account_id`, `actor_player_id`, `target_player_id`,
`source`, `command`, sanitized `parameters`, `before_state` / `after_state`
snapshots (level, XP, kamas, life, energy, capitals, map, cell), `result`
(`confirmation_required` · `success` · `error` · `forbidden`) and `error`.
Denied and malformed attempts are audited too, and so are searches
(`command = 'search_players'`). Migration `0060_admin_command_audit` creates the
table with indexes on `(actor_account_id, created_at DESC)` and
`(target_player_id, created_at DESC)`.

The mutation, the re-read of the target and the `success` audit row all happen
inside one `txHost.withTransaction` — a failure mid-command rolls back the
gameplay write and records an `error` row instead.

```sql
-- last 20 actions, newest first
SELECT created_at, source, command, result, target_player_id, error
FROM admin_command_audit ORDER BY created_at DESC LIMIT 20;
```

## Online targets

Offline characters are edited in the database and nothing else happens. When the
target has a live session (`PlayerPresenceService`), `refreshOnline()` pushes
exactly what changed: a real `MapTransitionService.teleport()` for moves, the
item template + item-add frames for a grant, an `As` stats frame, and a fresh
`SpellList` when spells were touched. No reconnection, no relog.

## Protocol

`proto/admin.proto` — client → server `AdminPlayerSearchRequest` (520) and
`AdminCommandRequest` (521); server → client `AdminCapabilities` (219),
`AdminPlayerSearchResponse` (220), `AdminCommandResponse` (221).
`AdminCapabilities` is pushed once, right after `AccountSelectCharacter`
succeeds.

Amounts are `string` on the wire on purpose: kamas and XP are `bigint` on both
ends and would lose precision as a JS `number`.

Regenerate after touching the proto:

```bash
buf generate           # from the repo root, writes packages/proto/gen
```

## Files

| Path | Role |
|---|---|
| `proto/admin.proto` | messages and enums |
| `apps/gameserver-ts/migrations/0060_admin_command_audit.ts` | audit table |
| `…/features/game/admin/admin.handler.ts` | `@MessageHandler` routing, replies on the session |
| `…/features/game/admin/admin.service.ts` | authorization, validation, confirmation, execution, audit |
| `…/features/game/admin/admin.repository.ts` | player lookup, audit read/write, targeted player updates |
| `apps/electrobun/src/game/network/handlers/admin.handler.ts` | client transport, pending-confirmation bookkeeping |
| `apps/electrobun/src/game/stores/admin-store.ts` | capability, target, activity, pending state |
| `apps/electrobun/src/hud/admin/AdminDrawer.tsx` | the drawer |
| `apps/electrobun/src/game/chat/chat-commands.ts` | slash-command parsing |

The pre-existing dev-only FPS/perf panel was renamed `AdminPanel` →
`PerformancePanel` so the name is free for the real thing.

## Tests

```bash
cd apps/gameserver-ts
bun test src/core/features/game/admin/     # authorization, replay, confirmation, commands
cd ../electrobun
bun test src/game/chat/chat-commands.spec.ts
```

## Limits

- Granting an item does not check pods or free inventory space.
- No rate limiting: an admin can issue commands as fast as the socket allows.
- Search is a `%name%` `ilike` capped at 20 rows, soft-deleted characters
  excluded; only characters are addressable — no monsters, NPCs or accounts.
- Nothing exposes the audit trail in-game; read it in SQL.
- There is no in-game way to grant `is_admin`; set it in the database
  (see [data-seeding.md](data-seeding.md)).
