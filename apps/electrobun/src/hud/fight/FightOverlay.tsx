import { useEffect, useRef } from "react";

import type { FighterSnapshot } from "@/game/machines/fight.machine";
import { Button } from "@/components/ui/button";
import { Forfeit } from "@/components/ui/icons/fight/forfeit";
import { Tactical } from "@/components/ui/icons/fight/tactical";
import {
  TurnTimeline,
  type TurnTimelineEntry,
} from "@/components/ui/turn-timeline";
import { getFighterPortraitRenderer } from "@/game/render/fighter-portrait-renderer";
import { useTacticalMode } from "@/hud/fight/tactical-mode-store";
import { useFightMode } from "@/hud/fight/useFightMode";

import { FightPlacementPanel } from "./FightPlacementPanel";
import { TurnChangeBanner } from "./TurnChangeBanner";
import { useFightClock } from "./useFightClock";

export interface FightOverlayActions {
  onForfeit: () => void;
  onReady: () => void;
  onSelectSpell: (spellId: number) => void;
  onHoverFighter: (spriteId: string | null) => void;
}

interface FightOverlayProps {
  actions: FightOverlayActions;
}

/**
 * React fight HUD layered above the canvas. Mounted whenever fightStore
 * reports placement/fighting/spectating. The banner owns resources,
 * spells and pass-turn; this overlay owns the timeline and placement.
 */
export function FightOverlay({ actions }: FightOverlayProps) {
  const fight = useFightMode();
  const { tactical, toggleTactical } = useTacticalMode();
  const { seconds, remainingFraction } = useFightClock(
    fight.deadline,
    fight.turnDurationMs
  );

  if (!fight.isFighting) {
    return null;
  }

  // The server-truth roster lives on fightStore.fighters. For every
  // sprite on the timeline we look up its FighterSnapshot; team
  // coloring comes from `fighter.team` vs our own team, not from
  // sprite-id sign (which is only meaningful for monster groups).
  const mySpriteId = fight.mySpriteId;
  const myTeam = (mySpriteId && fight.fighters.get(mySpriteId)?.team) ?? 0;
  const entries: TurnTimelineEntry[] = fight.timeline.map((spriteId) => {
    const f = fight.fighters.get(spriteId);
    const team: "ally" | "enemy" = f
      ? f.team === myTeam
        ? "ally"
        : "enemy"
      : "ally";
    const hp = f && f.maxHp > 0 ? f.hp / f.maxHp : undefined;
    return {
      id: spriteId,
      name: f?.name ?? spriteId,
      level: f?.level,
      team,
      color: f?.team === 1 ? "blue" : "red",
      portrait: f ? <TimelinePortrait fighter={f} /> : undefined,
      active: fight.currentTurnSpriteId === spriteId,
      dead: f?.dead,
      ...(hp !== undefined ? { hpFraction: hp } : {}),
      ...(f ? { ap: f.ap, mp: f.mp } : {}),
    };
  });

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-fight-overlay
    >
      {/* Top-left: animated turn-change banner (canonical
          UI_StringCourse — name + level + portrait + colour zones,
          slides in on every TURN_START). */}
      <TurnChangeBanner />
      {fight.isPlacement && fight.deadline > 0 && (
        <div
          role="timer"
          aria-label="Temps restant"
          className="absolute right-2 top-2 rounded bg-[#eee5cc] px-3 py-1 font-bold text-[#514a3c]"
        >
          {seconds} s
        </div>
      )}

      {/* Timeline above the banner. */}
      <div className="pointer-events-auto absolute bottom-[calc(170px*var(--resolution-factor))] right-[calc(8px*var(--resolution-factor))]">
        <TurnTimeline
          entries={entries}
          currentTurn={fight.turnIndex + 1}
          remainingFraction={remainingFraction}
          onSelect={actions.onHoverFighter}
          onHover={actions.onHoverFighter}
        />
      </div>

      {/* Bottom-right (above banner): tactical / forfeit always visible
          during placement + combat. */}
      <div className="pointer-events-auto absolute right-[calc(8px*var(--resolution-factor))] bottom-[calc(140px*var(--resolution-factor))] flex gap-[calc(4px*var(--resolution-factor))]">
        <Button
          variant="rectangle"
          onClick={toggleTactical}
          aria-pressed={tactical}
          title={tactical ? "Mode normal" : "Mode tactique"}
        >
          <Tactical className="h-[calc(16px*var(--resolution-factor))] w-[calc(16px*var(--resolution-factor))]" />
        </Button>
        <Button
          variant="rectangle"
          onClick={actions.onForfeit}
          title="Abandonner"
        >
          <Forfeit className="h-[calc(16px*var(--resolution-factor))] w-[calc(16px*var(--resolution-factor))]" />
        </Button>
      </div>

      {/* Bottom-center: placement panel during prep. Spell selection
       * during combat is handled by BannerReact's hotbar slots — they
       * already render the player's positioned spells with proper
       * Vello icons + tooltips, so we no longer overlay a separate
       * FightSpellBar with a duplicated visual style. */}
      {fight.isPlacement && <FightPlacementPanel onReady={actions.onReady} />}
    </div>
  );
}

/** Copy the cached artwork: equal monster portraits must not share a DOM canvas. */
function TimelinePortrait({ fighter }: { fighter: FighterSnapshot }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { gfxId, color1, color2, color3 } = fighter;
  useEffect(() => {
    let cancelled = false;
    void getFighterPortraitRenderer()
      .getCanvas(gfxId, 96, [color1, color2, color3])
      .then((source) => {
        const canvas = ref.current;
        if (cancelled || !source || !canvas) {
          return;
        }
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.getContext("2d")?.drawImage(source, 0, 0);
      });
    return () => {
      cancelled = true;
    };
  }, [gfxId, color1, color2, color3]);
  return <canvas ref={ref} className="h-full w-full object-contain" />;
}
