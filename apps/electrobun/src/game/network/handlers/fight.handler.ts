import { create } from "@bufbuild/protobuf";

import type { Connection } from "@/game/network/connection";
import type { MessageHandler } from "@/game/network/message-handler";
import type { CombatPresentation } from "@/game/scene/fight/combat-presentation";
import { combatant, emphasis, fightLog } from "@/game/chat/fight-log";
import {
  formatEffect,
  loadEffectsLang,
  needsMultipleValues,
} from "@/game/lang/effects-lang";
import { spellCastActor } from "@/game/machines/spell-cast.machine";
import { encodeFightPath } from "@/game/network/path-codec";
import {
  FightBlockJoinExceptPartyRequestSchema,
  FightBlockJoinRequestSchema,
  FightBlockSpectatorsRequestSchema,
  FightNeedHelpRequestSchema,
  type ActionAPChange,
  type ActionDamage,
  type ActionDeath,
  type ActionDirectionChange,
  type ActionMPChange,
  type ActionSpellLaunch,
  type ActionSpritePosition,
  type ActionStateChange,
  type ActionSummon,
  encodeClient,
  type GameAction,
  GameActionRequestSchema,
  type GameCreate,
  type GameEnd,
  type GameJoin,
  GameLeaveRequestSchema,
  type GameMovement,
  type GamePositionStart,
  type GameReady,
  GameSetFlagSchema,
  GameSetPositionSchema,
  GameSetReadySchema,
  GameTurnEndSchema,
  type GameTurnFinish,
  type GameTurnList,
  GameTurnOkSchema,
  type GameTurnStart,
  type GameZoneData,
  GameZoneData_Operation,
} from "@/game/network/protocol";
import { appendInfoMessage } from "@/game/stores/chat-store";
import { fightActor } from "@/game/stores/fight-store";
import { inventoryStore } from "@/game/stores/inventory-store";
import {
  applySpellCooldown,
  CLOSE_COMBAT_SPELL_ID,
  spellsStore,
} from "@/game/stores/spells-store";
import { setFightFlag } from "@/hud/fight/fight-flag-store";
import {
  type FightOptionCode,
  FightOptionCode as FightOption,
  applyFightOption,
} from "@/hud/fight/fight-options-store";
import { createLogger } from "@/utils/logger";

const log = createLogger("FightHandler");

/**
 * How long the client waits for the `gameActionsFinish` that closes an
 * action it sent. The server answers within a round-trip, so this only
 * ever fires when a frame was lost; without it a dropped answer would
 * leave the turn unplayable, since this is now the only barrier on
 * input.
 */
const ACTION_TIMEOUT_MS = 3000;

export interface SpellCastPayload {
  casterId: number;
  spellId: number;
  /**
   * SWF/dofasset filename to load — the server's `sorts.sprite`
   * (StarLoco) or GA;300 `visual` (Hetwan). Often differs from
   * `spellId` because many gameplay spells share one gfx file.
   * Defaults to `spellId` when the server hasn't been seeded with
   * the canonical mapping yet.
   */
  visualGfxId: number;
  spellLevel: number;
  targetCellId: number;
  critical: boolean;
  /** Cast pose hint from the server. Empty string = default ("anim1"). */
  animation: string;
}

export interface ZonePayload {
  cellId: number;
  size: number;
  /**
   * Zone tint as 24-bit RGB (0xRRGGBB). Server picks per-spell:
   * traps = orange, glyphs = element-keyed (fire = red, water = blue,
   * etc.). Client uses this directly so the on-map color matches the
   * canonical Dofus 1.29 palette.
   */
  color: number;
  /**
   * Mirrors @dofus/grid AreaKind. Server-supplied so non-circular
   * glyphs/traps render their actual shape. 0 (None) falls back to
   * Circle on the client side.
   */
  areaKind: number;
}

export interface FightEventHandlers {
  onFightCreated?: (payload: GameCreate) => void;
  onFightJoined?: (payload: GameJoin) => void;
  onPositionStart?: (payload: GamePositionStart) => void;
  onFightStart?: () => void;
  onFightEnd?: (payload: GameEnd) => void | Promise<void>;
  onTurnStart?: (payload: GameTurnStart) => void;
  onTurnEnd?: (payload: GameTurnFinish) => void;
  onTurnList?: (payload: GameTurnList) => void;
  onReady?: (payload: GameReady) => void;
  onCriticalHit?: () => void;
  onCriticalMiss?: () => void;
  onSpellCast?: (payload: SpellCastPayload) => void;
  onTriggeredSpell?: (payload: SpellCastPayload) => void;
  onAPChange?: (payload: ActionAPChange) => void;
  onMPChange?: (payload: ActionMPChange) => void;
  onDamage?: (payload: ActionDamage) => void;
  onDeath?: (payload: ActionDeath) => void;
  onTeleport?: (payload: ActionSpritePosition) => void;
  onDirectionChange?: (payload: ActionDirectionChange) => void;
  onStateChange?: (payload: ActionStateChange) => void;
  onSummon?: (payload: ActionSummon) => void;
  onVisibility?: (spriteId: string, visibility: number) => void;
  onAppearance?: (spriteId: string, gfxId: number) => void;
  onCarry?: (carrierId: string, carriedId: string) => void;
  onUncarry?: (carriedId: string, cellId: number, thrown: boolean) => void;
  onMovement?: (payload: GameMovement) => void;
  onZoneAdd?: (payload: ZonePayload) => void;
  onZoneRemove?: (payload: ZonePayload) => void;
}

/**
 * Fight network handler. Bridges in-combat proto messages to the
 * fightActor state machine + renderer callbacks.
 *
 * The new protocol unifies combat + roleplay movement under `gameMovement`
 * (sprite lifecycle) and `gameAction` (one-shot combat events with a
 * typed `action_data` oneof). This handler fans out those events.
 */
/**
 * Effects that already reach the log through their own AP/MP frame.
 *
 * A timed AP or MP theft broadcasts the loss *and* the buff that holds
 * it, so wording the buff too would print the same sentence twice. The
 * loss line is the one that survives; the fighter panel is where the
 * remaining turns are read. Ids come from the server's `ap-mp` and
 * `stat-boost` effect handlers.
 */
const SELF_ANNOUNCING_EFFECTS = new Set([
  77, 78, 84, 101, 111, 120, 127, 128, 168, 169,
]);

export class FightHandler {
  private presentation: CombatPresentation | null = null;
  private fightId = 0;
  private generation = 0;
  private readyEpoch = 0;
  setCombatPresentation(presentation: CombatPresentation): void {
    this.presentation = presentation;
  }
  private handlers: FightEventHandlers = {};
  private readonly criticalCasts = new Map<string, number>();
  private unsubscribers: (() => void)[] = [];
  private actionTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    messageHandler: MessageHandler,
    private readonly connection: Pick<Connection, "send">,
    /**
     * Resolves the local player's sprite id (= their character id, as a
     * string). The fight machine needs this to evaluate the `isMyTurn`
     * guard on TURN_START — without it every turn looks like an
     * opponent's turn, blocking move + cast input.
     */
    private readonly getMySpriteId: () => string | null = () => null
  ) {
    this.registerHandlers(messageHandler);
    // The combat log words buffs from the effects bundle, and the first
    // one lands within a turn of the first cast. Warming it here — the
    // call is idempotent and shares its promise — costs one fetch per
    // session and spares the log its cold-start silence.
    void loadEffectsLang();
  }

  setHandlers(handlers: FightEventHandlers): void {
    this.handlers = handlers;
  }

  private fighterName(id: string): string {
    return fightActor.getSnapshot().context.fighters.get(id)?.name ?? id;
  }

  /**
   * Raise the one barrier that still stands between the player and
   * their next click: the round-trip of the action we just sent.
   *
   * It is short by design — the server resolves an action whole and
   * answers with `gameActionsFinish` — and it is what guarantees the
   * cell, the AP and the MP behind the next click are the ones the
   * server will check. Should that answer never come the turn would be
   * unplayable, hence the deadline.
   */
  private beginAction(): void {
    fightActor.send({ type: "ACTION_PENDING", pending: true });
    if (this.actionTimeout !== null) {
      clearTimeout(this.actionTimeout);
    }
    this.actionTimeout = setTimeout(() => {
      this.actionTimeout = null;
      if (!fightActor.getSnapshot().context.actionPending) {
        return;
      }
      log.warn(
        `aucune fin d'action après ${ACTION_TIMEOUT_MS} ms — déverrouillage`
      );
      fightActor.send({ type: "ACTION_PENDING", pending: false });
    }, ACTION_TIMEOUT_MS);
  }

  private endAction(): void {
    if (this.actionTimeout !== null) {
      clearTimeout(this.actionTimeout);
      this.actionTimeout = null;
    }
    fightActor.send({ type: "ACTION_PENDING", pending: false });
  }

  private registerHandlers(mh: MessageHandler): void {
    this.unsubscribers.push(
      mh.on("gameActionsStart", (payload) => {
        if (payload.fightId !== this.fightId || !payload.fightId) {
          return;
        }
        this.presentation?.begin(payload.actionId);
      }),
      mh.on("gameTurnReady", (payload) => {
        if (
          payload.fightId !== this.fightId ||
          payload.turnEpoch <= this.readyEpoch ||
          fightActor.getSnapshot().context.isSpectator
        ) {
          return;
        }
        this.readyEpoch = payload.turnEpoch;
        const generation = this.generation;
        void Promise.resolve(this.presentation?.whenIdle()).then(() => {
          const spriteId = this.getMySpriteId();
          if (
            !spriteId ||
            this.generation !== generation ||
            this.readyEpoch !== payload.turnEpoch
          ) {
            return;
          }
          this.connection.send(
            encodeClient(
              "gameTurnOk",
              create(GameTurnOkSchema, {
                spriteId,
                fightId: payload.fightId,
                turnEpoch: payload.turnEpoch,
              })
            )
          );
        });
      })
    );
    this.unsubscribers.push(
      mh.on("gameActionsFinish", (payload) => {
        if (payload.fightId !== this.fightId) {
          return;
        }
        this.presentation?.finish(payload.actionId);
        if (payload.spriteId !== this.getMySpriteId()) {
          return;
        }
        this.endAction();
        if (payload.rejectionCode) {
          appendInfoMessage(payload.rejectionReason);
          spellCastActor.send({
            type: "SERVER_REJECTED",
            reason: payload.rejectionReason,
          });
        }
      })
    );
    this.unsubscribers.push(
      mh.on("gameCreate", (payload) => {
        // GameCreate is reused for both exploration entry (state=1)
        // and fight start (state=FightTypePvM=1). The two are
        // indistinguishable here, so we never use it to drive the
        // fight machine — gameJoin is the unambiguous fight-init
        // signal and is always sent alongside a real fight create.
        this.handlers.onFightCreated?.(payload);
      })
    );

    this.unsubscribers.push(
      mh.on("gameJoin", (payload) => {
        this.generation++;
        this.fightId = payload.fightId;
        this.readyEpoch = 0;
        this.presentation?.reset();
        this.criticalCasts.clear();
        for (const spell of spellsStore.getSnapshot().spells) {
          applySpellCooldown(spell.spellId, 0);
        }
        spellCastActor.send({ type: "RESET" });
        // A previous result may still be waiting for cosmetic/audio cleanup.
        // The new join owns the machine and must replace that combat now.
        fightActor.send({ type: "LEAVE" });
        const mySpriteId = this.getMySpriteId() ?? undefined;
        if (payload.isSpectator) {
          fightActor.send({
            type: "FIGHT_SPECTATE_INIT",
            payload,
            fightId: payload.fightId,
          });
        } else {
          fightActor.send({
            type: "FIGHT_INIT",
            payload,
            mySpriteId,
            fightId: payload.fightId,
          });
        }
        this.handlers.onFightJoined?.(payload);
      })
    );

    this.unsubscribers.push(
      mh.on("gamePositionStart", (payload) => {
        this.handlers.onPositionStart?.(payload);
      })
    );

    this.unsubscribers.push(
      mh.on("gameStartToPlay", () => {
        fightActor.send({ type: "FIGHT_START" });
        this.handlers.onFightStart?.();
      })
    );

    this.unsubscribers.push(
      mh.on("gameEnd", (payload) => {
        const generation = ++this.generation;
        this.criticalCasts.clear();
        fightActor.send({ type: "FINISHING" });
        spellCastActor.send({ type: "TURN_ENDED" });
        Promise.resolve(this.handlers.onFightEnd?.(payload)).finally(() => {
          if (generation === this.generation) {
            fightActor.send({ type: "FIGHT_END", payload });
          }
        });
      })
    );

    this.unsubscribers.push(
      mh.on("gameTurnStart", (payload) => {
        // TURN_START clears `actionPending` inside the machine; drop
        // the deadline with it so it cannot fire into the new turn.
        if (this.actionTimeout !== null) {
          clearTimeout(this.actionTimeout);
          this.actionTimeout = null;
        }
        fightActor.send({ type: "TURN_START", payload });
        this.handlers.onTurnStart?.(payload);
      })
    );

    this.unsubscribers.push(
      mh.on("gameTurnFinish", (payload) => {
        this.criticalCasts.delete(payload.spriteId);
        fightActor.send({ type: "TURN_END", payload });
        this.handlers.onTurnEnd?.(payload);
      })
    );

    this.unsubscribers.push(
      mh.on("gameTurnList", (payload) => {
        fightActor.send({
          type: "TIMELINE_UPDATE",
          timeline: payload.spriteIds,
        });
        this.handlers.onTurnList?.(payload);
      })
    );

    this.unsubscribers.push(
      mh.on("gameTurnMiddle", (payload) => {
        // Per-turn snapshot: every fighter's current LP/AP/MP/cell.
        // Project the full roster into the fight store so the HUD
        // (timeline, fighter panels, hover preview) reflects server
        // truth; mirror our own stats into the top-level ap/mp for
        // the gauges + reachable-range calc.
        const mySpriteId = this.getMySpriteId();
        for (const entry of payload.entries) {
          const previous = fightActor
            .getSnapshot()
            .context.fighters.get(entry.spriteId);
          const visibility = entry.hidden ? 2 : entry.invisible ? 1 : 0;
          if (
            previous?.hidden !== entry.hidden ||
            previous?.invisible !== entry.invisible
          ) {
            this.handlers.onVisibility?.(entry.spriteId, visibility);
          }
          if (previous?.appearanceGfx !== entry.appearanceGfx) {
            this.handlers.onAppearance?.(entry.spriteId, entry.appearanceGfx);
          }
          if (
            entry.carriedById &&
            entry.carriedById !== previous?.carriedById
          ) {
            this.handlers.onCarry?.(entry.carriedById, entry.spriteId);
          }
          if (!entry.carriedById && previous?.carriedById) {
            this.handlers.onUncarry?.(entry.spriteId, entry.cellNum, false);
          }
          fightActor.send({
            type: "FIGHTER_UPDATE",
            spriteId: entry.spriteId,
            patch: {
              hp: entry.lp,
              maxHp: entry.lpMax,
              ap: entry.ap,
              mp: entry.mp,
              cell: entry.hidden ? -1 : entry.cellNum,
              invisible: entry.invisible,
              hidden: entry.hidden,
              carryingId: entry.carryingId,
              carriedById: entry.carriedById,
              appearanceGfx: entry.appearanceGfx,
              maxSummons: entry.maxSummons,
              staticFighter: entry.staticFighter,
              resurrectable: entry.resurrectable,
              maxAp: entry.apMax,
              maxMp: entry.mpMax,
              rangeBonus: entry.rangeBonus,
              states: entry.states,
              dead: entry.isDead,
            },
          });
        }
        if (!mySpriteId) {
          return;
        }
        const mine = payload.entries.find((e) => e.spriteId === mySpriteId);
        if (!mine) {
          return;
        }
        // Mirror current resources and maxima from the authoritative GTM.
        fightActor.send({
          type: "STATS_UPDATE",
          ap: mine.ap,
          mp: mine.mp,
          maxAp: mine.apMax,
          maxMp: mine.mpMax,
        });
      })
    );

    this.unsubscribers.push(
      mh.on("gameReady", (payload) => {
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId: payload.spriteId,
          patch: { ready: payload.isReady },
        });
        this.handlers.onReady?.(payload);
      })
    );

    // The four leader-only options (`Go`) and the team-only cell marker
    // (`Gf`). Both are broadcast state: the server has already decided
    // who receives them, so the client just records what it is told.
    this.unsubscribers.push(
      mh.on("gameFightOption", (payload) => {
        applyFightOption(payload.option, payload.enabled, payload.leaderId);
      })
    );

    this.unsubscribers.push(
      mh.on("gameFlag", (payload) => {
        setFightFlag(payload.spriteId, payload.cellId);
      })
    );

    this.unsubscribers.push(
      mh.on("gameMovement", (payload) => {
        if (fightActor.getSnapshot().context.finishing) {
          return;
        }
        // During placement / combat, each sprite entry is a fighter —
        // the server fans out ADD on placement, UPDATE on summon, and
        // REMOVE on despawn. Keep the fighters map in sync so the HUD
        // has name/level/team/hp without needing a separate roster
        // frame. Outside a fight the state machine ignores these
        // events (gated on the placement / fighting / spectating
        // substates), so this is cheap in the roleplay path.
        for (const entry of payload.entries) {
          if (entry.operation === 2 /* REMOVE */) {
            fightActor.send({
              type: "FIGHTER_REMOVE",
              spriteId: entry.spriteId,
            });
            continue;
          }
          // Only push sprites the server actually placed in a team —
          // roleplay players have team=0 by default, so we filter
          // using the per-entry fight fields (lpMax > 0 means the
          // server prepared it as a fighter).
          if (entry.lpMax <= 0 && entry.lp <= 0) {
            continue;
          }
          // Monster-group entries carry their colours on the leader
          // member, not on `entry.colors` (the top-level CharacterColors
          // is for player sprites). Mirror what `encodeLook` does in
          // map.handler.ts so player and monster fighters both end up
          // in the store with the right tint.
          const isMonsterGroup =
            entry.spriteType === 3 /* SPRITE_TYPE_MONSTER_GROUP */ &&
            entry.monsters.length > 0;
          const leader = isMonsterGroup ? entry.monsters[0] : null;
          const c1 = leader?.color1 ?? entry.colors?.color1 ?? -1;
          const c2 = leader?.color2 ?? entry.colors?.color2 ?? -1;
          const c3 = leader?.color3 ?? entry.colors?.color3 ?? -1;
          fightActor.send({
            type: "FIGHTER_UPSERT",
            fighter: {
              spriteId: entry.spriteId,
              name: entry.name || `Actor ${entry.spriteId}`,
              level: entry.level,
              team: entry.team === 1 ? 1 : 0,
              cell: entry.cellId,
              hp: entry.lp,
              maxHp: entry.lpMax,
              ap: entry.ap,
              maxAp: entry.ap,
              mp: entry.mp,
              maxMp: entry.mp,
              gfxId: entry.gfxId,
              dead: false,
              color1: c1,
              color2: c2,
              color3: c3,
              ...(entry.isSummoned ? { summonedBy: entry.summonerId } : {}),
            },
          });
        }
        this.handlers.onMovement?.(payload);
      })
    );

    this.unsubscribers.push(
      mh.on("gameAction", (payload) => this.routeAction(payload))
    );

    this.unsubscribers.push(
      mh.on("gameZoneData", (payload: GameZoneData) => {
        const zone: ZonePayload = {
          cellId: payload.cellId,
          size: payload.size,
          color: payload.color,
          areaKind: payload.areaKind,
        };
        if (payload.operation === GameZoneData_Operation.ADD) {
          this.handlers.onZoneAdd?.(zone);
        } else if (payload.operation === GameZoneData_Operation.REMOVE) {
          this.handlers.onZoneRemove?.(zone);
        }
      })
    );
  }

  private routeAction(action: GameAction): void {
    const data = action.actionData;

    switch (data.case) {
      case "glyph":
        this.handlers.onTriggeredSpell?.({
          casterId: Number(action.spriteId),
          spellId: data.value.param1,
          visualGfxId: data.value.param2,
          spellLevel: data.value.param3 || 1,
          targetCellId: data.value.cellId,
          critical: false,
          animation: "",
        });
        break;
      case "spellLaunch": {
        // The frame carries the name the server resolved, which is the
        // only one that works for a spell the viewer does not own — a
        // monster's. The store is the fallback for a server that
        // predates the field, the bare id the fallback for both.
        const spellName =
          data.value.name ||
          spellsStore.getSnapshot().byId.get(data.value.spellId)?.name ||
          `le sort ${data.value.spellId}`;
        fightLog(
          combatant(this.fighterName(action.spriteId)),
          " lance ",
          emphasis(spellName),
          "."
        );
        const cast = spellLaunchToPayload(action, data.value);
        cast.critical =
          this.criticalCasts.get(action.spriteId) === data.value.spellId;
        this.criticalCasts.delete(action.spriteId);
        this.handlers.onSpellCast?.(cast);
        break;
      }
      // A weapon swing. The wire verb differs from a spell cast
      // (`GA;303`, per 1.29) but the presentation is the same one:
      // `visualGfxId` 0 means "no spell visual", so the caster plays
      // the weapon's pose and the damage still gates behind it.
      case "closeCombat": {
        // The weapon template is named only when the viewer happens to
        // own one too — `inventoryStore.templates` holds what the
        // server sent for *this* player's items, never another
        // fighter's. Falling back to the bare verb is the honest
        // reading rather than inventing a weapon name.
        const weapon = inventoryStore
          .getSnapshot()
          .templates.get(data.value.weaponTemplateId)?.name;
        if (weapon) {
          fightLog(
            combatant(this.fighterName(action.spriteId)),
            " frappe avec ",
            emphasis(weapon),
            "."
          );
        } else {
          fightLog(
            combatant(this.fighterName(action.spriteId)),
            " frappe au corps à corps."
          );
        }
        const casterId = Number(action.spriteId) || 0;
        this.handlers.onSpellCast?.({
          casterId,
          spellId: CLOSE_COMBAT_SPELL_ID,
          visualGfxId: 0,
          spellLevel: 1,
          targetCellId: data.value.targetCell,
          critical:
            this.criticalCasts.get(action.spriteId) === CLOSE_COMBAT_SPELL_ID,
          animation: data.value.animation || "anim1",
        });
        this.criticalCasts.delete(action.spriteId);
        break;
      }
      case "criticalHit":
        this.criticalCasts.set(action.spriteId, data.value.spellId);
        this.handlers.onCriticalHit?.();
        fightLog(
          combatant(this.fighterName(action.spriteId)),
          " : coup critique !"
        );
        break;
      case "criticalMiss":
        this.criticalCasts.delete(action.spriteId);
        this.handlers.onCriticalMiss?.();
        fightLog(
          combatant(this.fighterName(action.spriteId)),
          " : échec critique."
        );
        if (action.spriteId === this.getMySpriteId()) {
          spellCastActor.send({ type: "RESET" });
        }
        break;
      case "effectApply": {
        const effect = data.value;
        const fighter = fightActor
          .getSnapshot()
          .context.fighters.get(effect.targetSpriteId);
        if (effect.effectId === 149 && effect.buffId === 0) {
          fightActor.send({
            type: "FIGHTER_UPDATE",
            spriteId: effect.targetSpriteId,
            patch: { appearanceGfx: effect.value },
          });
          this.handlers.onAppearance?.(effect.targetSpriteId, effect.value);
          break;
        }
        if (fighter && effect.buffId > 0) {
          const buffs = (fighter.buffs ?? []).filter(
            (b) => b.id !== effect.buffId
          );
          buffs.push({
            id: effect.buffId,
            spellId: effect.spellId,
            effectId: effect.effectId,
            value: effect.value,
            duration: effect.duration,
          });
          fightActor.send({
            type: "FIGHTER_UPDATE",
            spriteId: effect.targetSpriteId,
            patch: { buffs },
          });
        }
        if (
          !fighter?.buffs?.some((buff) => buff.id === effect.buffId) &&
          !SELF_ANNOUNCING_EFFECTS.has(effect.effectId) &&
          !needsMultipleValues(effect.effectId)
        ) {
          // The lang bundle words the effect the same way the spell book
          // does — "+20 en intelligence (3 tours)" — so `max: 0` is what
          // collapses the range template down to the one value a live
          // buff actually has. An effect the bundle does not know stays
          // silent: "reçoit un effet" said nothing worth a line.
          const formatted = formatEffect({
            effectId: effect.effectId,
            min: effect.value,
            max: 0,
            special: 0,
            duration: effect.duration,
          });
          if (formatted) {
            fightLog(
              combatant(this.fighterName(effect.targetSpriteId)),
              ` : ${formatted.text}`
            );
          }
        }
        break;
      }
      case "removeEffects":
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId: data.value.targetId,
          patch: { buffs: [] },
        });
        break;
      case "invisibility": {
        const { spriteId, visibility } = data.value;
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId,
          patch: {
            invisible: visibility > 0,
            hidden: visibility === 2,
            ...(visibility === 2 ? { cell: -1 } : {}),
          },
        });
        this.handlers.onVisibility?.(spriteId, visibility);
        break;
      }
      case "carry": {
        const carriedId = data.value.carriedSpriteId;
        const carrier = fightActor
          .getSnapshot()
          .context.fighters.get(action.spriteId);
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId: action.spriteId,
          patch: { carryingId: carriedId },
        });
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId: carriedId,
          patch: { carriedById: action.spriteId, cell: carrier?.cell ?? -1 },
        });
        this.handlers.onCarry?.(action.spriteId, carriedId);
        break;
      }
      case "throwCarried":
      case "uncarry": {
        const fighters = fightActor.getSnapshot().context.fighters;
        const carriedId =
          data.case === "uncarry"
            ? data.value.spriteId
            : fighters.get(action.spriteId)?.carryingId;
        if (!carriedId) {
          break;
        }
        const carrierId =
          fighters.get(carriedId)?.carriedById ?? action.spriteId;
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId: carrierId,
          patch: { carryingId: "" },
        });
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId: carriedId,
          patch: { carriedById: "", cell: data.value.cellId },
        });
        this.handlers.onUncarry?.(
          carriedId,
          data.value.cellId,
          data.case === "throwCarried"
        );
        break;
      }
      case "reduceDamage":
        fightLog(
          combatant(this.fighterName(data.value.spriteId)),
          ` réduit les dommages de ${data.value.amount}.`
        );
        break;
      case "returnDamage":
        fightLog(
          combatant(this.fighterName(data.value.spriteId)),
          ` renvoie ${data.value.amount} dommages.`
        );
        break;
      case "returnSpell":
        fightLog(
          combatant(this.fighterName(data.value.spriteId)),
          " renvoie le sort."
        );
        break;
      case "apChange": {
        this.handlers.onAPChange?.(data.value);
        const fighter = fightActor
          .getSnapshot()
          .context.fighters.get(data.value.spriteId);
        if (fighter) {
          fightActor.send({
            type: "FIGHTER_UPDATE",
            spriteId: fighter.spriteId,
            patch: { ap: Math.max(0, fighter.ap + data.value.delta) },
          });
        }
        // `cost` is the AP the actor spent on its own turn — a cast, a
        // tackle. Logging it put one line between every action and its
        // result; what the player wants told is AP a spell took off
        // somebody, which arrives with `cost` false.
        if (!data.value.cost) {
          fightLog(
            combatant(this.fighterName(data.value.spriteId)),
            ` : ${data.value.delta > 0 ? "+" : ""}${data.value.delta} PA.`
          );
        }
        // Delta is a signed change (negative = AP spent). Apply
        // relative to current AP, not overwrite, so consecutive casts
        // stack. Only mirror when the event targets the local player.
        const my = this.getMySpriteId();
        if (my && data.value.spriteId === my) {
          const snap = fightActor.getSnapshot();
          fightActor.send({
            type: "STATS_UPDATE",
            ap: snap.context.ap + data.value.delta,
          });
        }
        break;
      }
      case "mpChange": {
        this.handlers.onMPChange?.(data.value);
        const fighter = fightActor
          .getSnapshot()
          .context.fighters.get(data.value.spriteId);
        if (fighter) {
          fightActor.send({
            type: "FIGHTER_UPDATE",
            spriteId: fighter.spriteId,
            patch: { mp: Math.max(0, fighter.mp + data.value.delta) },
          });
        }
        // See `apChange` — a walked step is not news, MP a spell stole
        // is.
        if (!data.value.cost) {
          fightLog(
            combatant(this.fighterName(data.value.spriteId)),
            ` : ${data.value.delta > 0 ? "+" : ""}${data.value.delta} PM.`
          );
        }
        const my = this.getMySpriteId();
        if (my && data.value.spriteId === my) {
          const snap = fightActor.getSnapshot();
          fightActor.send({
            type: "STATS_UPDATE",
            mp: snap.context.mp + data.value.delta,
          });
        }
        break;
      }
      case "damage": {
        this.handlers.onDamage?.(data.value);
        fightLog(
          combatant(this.fighterName(data.value.spriteId)),
          ` ${data.value.amount < 0 ? "récupère" : "perd"} ${Math.abs(data.value.amount)} PV.`
        );
        // Mirror HP into the fighters map so the timeline bar and
        // hover tooltips reflect every hit without waiting for the
        // next gameTurnMiddle snapshot. Amount > 0 = damage, < 0 = heal.
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId: data.value.spriteId,
          patch: this.hpPatch(data.value.spriteId, -data.value.amount),
        });
        break;
      }
      case "death": {
        this.handlers.onDeath?.(data.value);
        fightLog(
          combatant(this.fighterName(data.value.spriteId)),
          " est mort."
        );
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId: data.value.spriteId,
          patch: { dead: true, hp: 0 },
        });
        break;
      }
      case "spritePosition": {
        // 4 = ACTION_SPRITE_POSITION; server uses it for teleports
        // (Boussole/Stabilisation/etc. move fighters without a walk
        // animation). Update the fighter's cell immediately; the
        // renderer snaps the sprite via onTeleport.
        this.handlers.onTeleport?.(data.value);
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId: data.value.spriteId,
          patch: { cell: data.value.cellId },
        });
        break;
      }
      case "directionChange":
        this.handlers.onDirectionChange?.(data.value);
        break;
      case "stateChange": {
        const { spriteId, stateId, active } = data.value;
        const states = new Set(
          fightActor.getSnapshot().context.fighters.get(spriteId)?.states ?? []
        );
        if (active) {
          states.add(stateId);
        } else {
          states.delete(stateId);
        }
        fightActor.send({
          type: "FIGHTER_UPDATE",
          spriteId,
          patch: { states: [...states] },
        });
        this.handlers.onStateChange?.(data.value);
        break;
      }
      case "summon": {
        const sd = data.value.spriteData;
        if (sd) {
          fightActor.send({
            type: "FIGHTER_UPSERT",
            fighter: {
              spriteId: sd.spriteId,
              name: sd.name || `Summon ${sd.spriteId}`,
              level: sd.level,
              team: sd.team === 1 ? 1 : 0,
              cell: data.value.cellId,
              hp: sd.lp,
              maxHp: sd.lpMax,
              ap: sd.ap,
              maxAp: sd.ap,
              mp: sd.mp,
              maxMp: sd.mp,
              gfxId: sd.gfxId,
              dead: false,
              color1: sd.colors?.color1 ?? -1,
              color2: sd.colors?.color2 ?? -1,
              color3: sd.colors?.color3 ?? -1,
              ...(sd.isSummoned
                ? { summonedBy: sd.summonerId || action.spriteId }
                : {}),
            },
          });
        }
        this.handlers.onSummon?.(data.value);
        break;
      }
      case "movement": {
        // Fight movement — update the fighter's cell in the store so
        // subsequent pathfinding calculations use the correct position.
        const path = data.value.pathCells;
        const endCell = path.length > 0 ? path[path.length - 1] : undefined;
        if (endCell !== undefined) {
          fightActor.send({
            type: "FIGHTER_UPDATE",
            spriteId: action.spriteId,
            patch: { cell: endCell },
          });
        }
        const carriedId = fightActor
          .getSnapshot()
          .context.fighters.get(action.spriteId)?.carryingId;
        if (carriedId && endCell !== undefined) {
          fightActor.send({
            type: "FIGHTER_UPDATE",
            spriteId: carriedId,
            patch: { cell: endCell },
          });
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Compute a HP patch from a current fighter snapshot: the wire delta
   * is applied to the latest known HP, floored at 0 and capped at maxHp.
   */
  private hpPatch(spriteId: string, delta: number): { hp: number } {
    const existing = fightActor.getSnapshot().context.fighters.get(spriteId);
    const current = existing?.hp ?? 0;
    const max = existing?.maxHp ?? Number.POSITIVE_INFINITY;
    return { hp: Math.max(0, Math.min(max, current + delta)) };
  }

  // ── Outbound commands (client → server) ───────────────────────────

  /** Accept an incoming fight challenge. */
  acceptChallenge(): void {
    this.connection.send(
      encodeClient(
        "gameAction",
        create(GameActionRequestSchema, { actionType: 901, params: "" })
      )
    );
  }

  /** Refuse an incoming fight challenge. */
  refuseChallenge(): void {
    this.connection.send(
      encodeClient(
        "gameAction",
        create(GameActionRequestSchema, { actionType: 902, params: "" })
      )
    );
  }

  /** Mark ready during placement. */
  setReady(ready: boolean): void {
    this.connection.send(
      encodeClient("gameSetReady", create(GameSetReadySchema, { ready }))
    );
  }

  /**
   * Toggle one of the four leader-only fight options. The request
   * bodies are empty — the server flips the flag and mirrors the new
   * value back as `gameFightOption`, so nothing is applied optimistically.
   */
  toggleFightOption(option: FightOptionCode): void {
    switch (option) {
      case FightOption.NeedHelp:
        this.connection.send(
          encodeClient("fightNeedHelp", create(FightNeedHelpRequestSchema, {}))
        );
        break;
      case FightOption.BlockJoin:
        this.connection.send(
          encodeClient("fightBlockJoin", create(FightBlockJoinRequestSchema, {}))
        );
        break;
      case FightOption.PartyOnly:
        this.connection.send(
          encodeClient(
            "fightBlockJoinExceptParty",
            create(FightBlockJoinExceptPartyRequestSchema, {})
          )
        );
        break;
      case FightOption.BlockSpectators:
        this.connection.send(
          encodeClient(
            "fightBlockSpectators",
            create(FightBlockSpectatorsRequestSchema, {})
          )
        );
        break;
    }
  }

  /** Drop the red "look here" arrow on a cell, for our team only. */
  setFlag(cellId: number): void {
    this.connection.send(
      encodeClient("gameSetFlag", create(GameSetFlagSchema, { cellId }))
    );
  }

  /** Pass the current turn. */
  passTurn(): void {
    this.connection.send(
      encodeClient("gameTurnEnd", create(GameTurnEndSchema, {}))
    );
  }

  /** Forfeit the fight. */
  forfeit(): void {
    this.connection.send(
      encodeClient("gameLeave", create(GameLeaveRequestSchema, {}))
    );
  }

  /** Set placement cell during preparation. */
  setPlacement(cellId: number): void {
    this.connection.send(
      encodeClient(
        "gameSetPosition",
        create(GameSetPositionSchema, { cellNum: cellId })
      )
    );
  }

  /**
   * Send a movement request during a fight. Path includes the starting
   * cell as path[0]; the codec emits steps for path[1..]. Action verb
   * 1 = ACTION_MOVEMENT.
   */
  sendMove(path: number[], mapWidth: number): void {
    const params = encodeFightPath(path, mapWidth);
    if (params === "") {
      return;
    }
    this.beginAction();
    this.connection.send(
      encodeClient(
        "gameAction",
        create(GameActionRequestSchema, { actionType: 1, params })
      )
    );
  }

  /**
   * Send a spell-cast request. Server expects params formatted as
   * "<spellId>;<targetCell>;<level>". Action verb 300 = ACTION_SPELL_LAUNCH.
   */
  sendCast(spellId: number, targetCellId: number, level = 1): void {
    this.beginAction();
    const params = `${spellId};${targetCellId};${level}`;
    this.connection.send(
      encodeClient(
        "gameAction",
        create(GameActionRequestSchema, { actionType: 300, params })
      )
    );
  }

  cancelPresentation(): void {
    if (this.actionTimeout !== null) {
      clearTimeout(this.actionTimeout);
      this.actionTimeout = null;
    }
    this.generation++;
    this.fightId = 0;
    this.readyEpoch = 0;
    this.presentation?.reset();
    spellCastActor.send({ type: "RESET" });
  }

  destroy(): void {
    this.cancelPresentation();
    this.criticalCasts.clear();
    for (const u of this.unsubscribers) {
      u();
    }
    this.unsubscribers = [];
    this.handlers = {};
  }
}

function spellLaunchToPayload(
  action: GameAction,
  data: ActionSpellLaunch
): SpellCastPayload {
  // param3 carries the visual gfx id (Hetwan's GA;300 `visual` field).
  // 0 = "no spell-specific visual" (StarLoco's sorts.sprite=0 — common
  // for glyphs / buffs / area effects where the canonical client just
  // plays the cast pose + shows the server-driven GameZoneData overlay).
  // Trust the server: do NOT fall back to spellId, because /spells/<id>.dofasset
  // probably doesn't exist for those spells and the loader will trip on
  // the dev server's HTML SPA fallback.
  const visualGfxId = data.param3;
  return {
    casterId: Number(action.spriteId) || 0,
    spellId: data.spellId,
    visualGfxId,
    spellLevel: data.param4 || 1,
    targetCellId: data.cellId,
    critical: false,
    // Server-supplied cast pose; fall back to "anim1" so the caster
    // sprite always has a CAST animation to play even on legacy frames.
    animation: data.animation || "anim1",
  };
}
