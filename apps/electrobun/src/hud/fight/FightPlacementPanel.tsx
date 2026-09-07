import { Button } from "@/components/ui/button";
import { Ready } from "@/components/ui/icons/fight/ready";
import { useFightMode } from "@/hud/fight/useFightMode";

interface FightPlacementPanelProps {
  onReady: () => void;
}

export function FightPlacementPanel({ onReady }: FightPlacementPanelProps) {
  const fight = useFightMode();
  if (!fight.isPlacement) {
    return null;
  }
  return (
    <div className="pointer-events-auto absolute bottom-[calc(140px*var(--resolution-factor))] left-1/2 -translate-x-1/2 flex flex-col items-center gap-[calc(4px*var(--resolution-factor))] rounded-[calc(4px*var(--resolution-factor))] border border-[#402b15] bg-[#1a1610]/85 p-[calc(8px*var(--resolution-factor))]">
      <div className="font-[Verdana,sans-serif] text-[calc(10px*var(--resolution-factor))] text-white">
        {fight.fighters.get(fight.mySpriteId ?? "")?.ready
          ? "Prêt — en attente des autres joueurs"
          : "Choisissez une position puis cliquez sur Prêt"}
      </div>
      <Button
        variant="pill"
        onClick={onReady}
        aria-pressed={
          fight.fighters.get(fight.mySpriteId ?? "")?.ready ?? false
        }
        title="Prêt"
      >
        <Ready className="h-[calc(16px*var(--resolution-factor))] w-[calc(22px*var(--resolution-factor))]" />
      </Button>
    </div>
  );
}
