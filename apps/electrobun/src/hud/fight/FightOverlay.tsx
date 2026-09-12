import { useEffect, useRef, useState } from "react";

import type { FighterSnapshot } from "@/game/machines/fight.machine";
import type { FightOptionCode } from "@/hud/fight/fight-options-store";
import {
  TurnTimeline,
  type TurnTimelineEntry,
} from "@/components/ui/turn-timeline";
import { getFighterPortraitRenderer } from "@/game/render/fighter-portrait-renderer";
import { useFightMode } from "@/hud/fight/useFightMode";

import { FighterEffects } from "./FighterEffects";
import { FightOptionsBar } from "./FightOptionsBar";
import { FightPlacementPanel } from "./FightPlacementPanel";
import { TurnChangeBanner } from "./TurnChangeBanner";
import { useFightClock } from "./useFightClock";

export interface FightOverlayActions {
  onForfeit: () => void;
  onReady: () => void;
  onSelectSpell: (spellId: number) => void;
  onHoverFighter: (spriteId: string | null) => void;
  onToggleOption: (option: FightOptionCode) => void;
  onToggleFlagArmed: () => void;
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
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const inspected = fight.fighters.get(hoveredId ?? inspectedId ?? "");
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
      {inspected && (
        <FighterEffects fighter={inspected} fighters={fight.fighters} />
      )}
      {fight.isPlacement && fight.deadline > 0 && (
        <div
          role="timer"
          aria-label="Temps restant"
          className="absolute right-[calc(8px*var(--resolution-factor))] top-[calc(8px*var(--resolution-factor))] rounded-[calc(3px*var(--resolution-factor))] bg-[#eee5cc] px-[calc(8px*var(--resolution-factor))] py-[calc(2px*var(--resolution-factor))] text-[calc(10px*var(--resolution-factor))] font-bold text-[#514a3c]"
        >
          {seconds} s
        </div>
      )}

      {/* Timeline above the banner. */}
      <div className="pointer-events-auto absolute bottom-[calc(196px*var(--resolution-factor))] right-[calc(8px*var(--resolution-factor))]">
        <TurnTimeline
          entries={entries}
          currentTurn={fight.turnIndex + 1}
          remainingFraction={remainingFraction}
          onSelect={(id) =>
            setInspectedId((previous) => (previous === id ? null : id))
          }
          onHover={(id) => {
            setHoveredId(id);
            actions.onHoverFighter(id);
          }}
        />
      </div>

      {/* Bottom-right, above the banner: the option row, and under it
       * the "Prêt" button while placement lasts — the arrangement 1.29
       * uses. Forfeit is not here any more: it lives under the banner
       * medallion, where retro puts it.
       *
       * Spell selection during combat is handled by BannerReact's
       * hotbar slots — they already render the player's positioned
       * spells with proper Vello icons + tooltips, so we do not overlay
       * a separate spell bar with a duplicated visual style. */}
      <div className="pointer-events-auto absolute right-[calc(8px*var(--resolution-factor))] bottom-[calc(132px*var(--resolution-factor))] flex flex-col items-end gap-[calc(4px*var(--resolution-factor))]">
        <FightOptionsBar
          isPlacement={fight.isPlacement}
          actions={{
            onToggleOption: actions.onToggleOption,
            onToggleFlagArmed: actions.onToggleFlagArmed,
          }}
        />
        {fight.isPlacement && <FightPlacementPanel onReady={actions.onReady} />}
      </div>
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
