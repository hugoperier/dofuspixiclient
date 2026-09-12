import { Button } from "@/components/ui/button";
import { useFightMode } from "@/hud/fight/useFightMode";

interface FightPlacementPanelProps {
  onReady: () => void;
}

/**
 * The big orange "Prêt" button of the preparation phase. Clicking it is
 * a toggle: the server refuses to move a fighter who is ready, so this
 * doubles as the placement lock, and a second click frees it again.
 */
export function FightPlacementPanel({ onReady }: FightPlacementPanelProps) {
  const fight = useFightMode();
  const ready = fight.fighters.get(fight.mySpriteId ?? "")?.ready ?? false;

  return (
    <div className="flex flex-col items-end gap-[calc(3px*var(--resolution-factor))]">
      <div className="font-[Verdana,sans-serif] text-[calc(9px*var(--resolution-factor))] text-white [text-shadow:0_calc(1px*var(--resolution-factor))_0_#000]">
        {ready
          ? "En attente des autres joueurs"
          : "Choisissez une position puis cliquez sur Prêt"}
      </div>
      <Button
        variant="pill"
        data-audio="click2"
        onClick={onReady}
        aria-pressed={ready}
        title="Prêt"
        className={[
          "h-[calc(26px*var(--resolution-factor))]",
          "w-[calc(96px*var(--resolution-factor))]",
          "text-[calc(13px*var(--resolution-factor))]",
          "italic text-white",
          "[text-shadow:0_calc(1px*var(--resolution-factor))_calc(1px*var(--resolution-factor))_rgba(0,0,0,0.45)]",
          "border-[#8f3403]",
          ready
            ? "bg-[linear-gradient(to_bottom,#8a5a3a,#6a3f22)]"
            : "bg-[linear-gradient(to_bottom,#ff8a3d,#ea5b0c)]",
          "shadow-[inset_0_calc(1px*var(--resolution-factor))_0_0_rgba(255,255,255,0.45)]",
        ].join(" ")}
      >
        Prêt
      </Button>
    </div>
  );
}
