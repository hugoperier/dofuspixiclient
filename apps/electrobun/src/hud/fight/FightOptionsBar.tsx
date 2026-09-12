import { Button } from "@/components/ui/button";
import { CreatureMode } from "@/components/ui/icons/fight/creature-mode";
import { Lock } from "@/components/ui/icons/fight/lock";
import { NeedHelp } from "@/components/ui/icons/fight/need-help";
import { ShowCell } from "@/components/ui/icons/fight/show-cell";
import { Spectators } from "@/components/ui/icons/fight/spectators";
import { Tactical } from "@/components/ui/icons/fight/tactical";
import { useCreatureMode } from "@/hud/fight/creature-mode-store";
import { useFightFlags } from "@/hud/fight/fight-flag-store";
import {
  FightOptionCode,
  useFightOptions,
} from "@/hud/fight/fight-options-store";
import { useTacticalMode } from "@/hud/fight/tactical-mode-store";

export interface FightOptionsBarActions {
  onToggleOption: (option: FightOptionCode) => void;
  onToggleFlagArmed: () => void;
}

const ICON = "h-[calc(14px*var(--resolution-factor))] w-[calc(14px*var(--resolution-factor))]";

/**
 * The row of option buttons DOFUS Retro shows above "Prêt", in its
 * order: tactical mode, ask for help, lock the fight, creature mode,
 * spectators, show a cell.
 *
 * Tactical and creature mode are render modes and stay available to
 * everyone at all times. Help and the padlock only mean something while
 * players can still join, so they are leader-only and disappear once the
 * fight starts. Spectators stays togglable mid-fight, as in 1.29.
 */
export function FightOptionsBar({
  isPlacement,
  actions,
}: {
  isPlacement: boolean;
  actions: FightOptionsBarActions;
}) {
  const { tactical, toggleTactical } = useTacticalMode();
  const { creature, toggleCreature } = useCreatureMode();
  const { armed } = useFightFlags();
  const options = useFightOptions();

  return (
    <div className="flex gap-[calc(3px*var(--resolution-factor))]">
      <Button
        variant="rectangle"
        data-audio="click2"
        onClick={toggleTactical}
        aria-pressed={tactical}
        title={tactical ? "Mode normal" : "Mode tactique"}
      >
        <Tactical className={ICON} />
      </Button>

      {isPlacement && options.isLeader && (
        <Button
          variant="rectangle"
          data-audio="click2"
          onClick={() => actions.onToggleOption(FightOptionCode.NeedHelp)}
          aria-pressed={options.needHelp}
          title="Demander de l'aide"
        >
          <NeedHelp className={ICON} />
        </Button>
      )}

      {isPlacement && options.isLeader && (
        <Button
          variant="rectangle"
          data-audio="click2"
          onClick={() => actions.onToggleOption(FightOptionCode.BlockJoin)}
          aria-pressed={options.blockJoin}
          title={
            options.blockJoin ? "Déverrouiller le combat" : "Verrouiller le combat"
          }
        >
          <Lock className={ICON} />
        </Button>
      )}

      <Button
        variant="rectangle"
        data-audio="click2"
        onClick={toggleCreature}
        aria-pressed={creature}
        title={creature ? "Mode normal" : "Mode créature"}
      >
        <CreatureMode className={ICON} />
      </Button>

      {options.isLeader && (
        <Button
          variant="rectangle"
          data-audio="click2"
          onClick={() => actions.onToggleOption(FightOptionCode.BlockSpectators)}
          aria-pressed={options.blockSpectators}
          title={
            options.blockSpectators
              ? "Autoriser les spectateurs"
              : "Interdire les spectateurs"
          }
        >
          <Spectators className={ICON} blocked={options.blockSpectators} />
        </Button>
      )}

      <Button
        variant="rectangle"
        data-audio="click2"
        onClick={actions.onToggleFlagArmed}
        aria-pressed={armed}
        title="Montrer une case"
      >
        <ShowCell className={ICON} />
      </Button>
    </div>
  );
}
