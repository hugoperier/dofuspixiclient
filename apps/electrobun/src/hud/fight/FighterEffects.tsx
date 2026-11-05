import { useEffect, useState } from "react";

import type { FighterSnapshot } from "@/game/machines/fight.machine";
import { formatEffect, loadEffectsLang } from "@/game/lang/effects-lang";
import { SpellIconMount } from "@/hud/spells/SpellIconMount";

type Names = {
  spells: Record<string, { n?: string }>;
  states: Record<string, { n?: string; d?: boolean }>;
};
let namesPromise: Promise<Names> | undefined;
function loadNames(): Promise<Names> {
  namesPromise ??= Promise.all([
    fetch("/assets/langs/fr/spells.json").then((r) => r.json()),
    fetch("/assets/langs/fr/states.json").then((r) => r.json()),
    loadEffectsLang(),
  ]).then(([spells, states]) => ({
    spells: spells.data.S,
    states: states.data.ST,
  }));
  return namesPromise;
}

/** Details follow the inspected timeline portrait, with authoritative durations. */
export function FighterEffects({
  fighter,
  fighters,
}: {
  fighter: FighterSnapshot;
  fighters: ReadonlyMap<string, FighterSnapshot>;
}) {
  const [names, setNames] = useState<Names>();
  useEffect(() => {
    let active = true;
    void loadNames()
      .then((value) => {
        if (active) {
          setNames(value);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const buffs = fighter.buffs ?? [];
  const status = [
    fighter.dead ? "Mort" : undefined,
    fighter.invisible ? "Invisible" : undefined,
    fighter.carriedById
      ? `Porté par ${fighters.get(fighter.carriedById)?.name ?? "un combattant"}`
      : undefined,
    fighter.carryingId
      ? `Porte ${fighters.get(fighter.carryingId)?.name ?? "un combattant"}`
      : undefined,
    ...(fighter.states ?? [])
      .filter((id) => names?.states[id]?.d !== false)
      .map((id) => names?.states[id]?.n ?? `État ${id}`),
  ].filter(Boolean);
  return (
    <aside
      aria-label={`Effets de ${fighter.name}`}
      className="pointer-events-auto absolute right-2 bottom-[calc(220px*var(--resolution-factor))] max-h-[40%] w-72 overflow-auto rounded border border-[#76684e] bg-[#eee5cc]/95 p-2 text-xs text-[#514a3c] shadow-lg"
    >
      <strong>{fighter.name}</strong>
      <div>
        {fighter.hp} / {fighter.maxHp} PV · {fighter.ap} PA · {fighter.mp} PM
      </div>
      {status.length > 0 && <div className="mt-1">{status.join(" · ")}</div>}
      {buffs.length === 0 ? (
        <p className="mt-2 opacity-70">Aucun effet temporaire.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {buffs.map((buff) => {
            const description = formatEffect({
              effectId: buff.effectId,
              min: buff.value,
              max: 0,
              special: 0,
              duration: 0,
            })?.text;
            return (
              <li
                key={buff.id}
                className="flex items-center gap-2 border-t border-[#76684e]/25 pt-1"
              >
                {buff.spellId > 0 && (
                  <span className="relative h-7 w-7 shrink-0">
                    <SpellIconMount
                      spellId={buff.spellId}
                      label={names?.spells[buff.spellId]?.n ?? "Sort"}
                    />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-bold">
                    {names?.spells[buff.spellId]?.n ?? `Sort ${buff.spellId}`}
                  </div>
                  {description && <div>{description}</div>}
                  <div className="opacity-75">
                    {buff.duration < 0
                      ? "Jusqu’à la fin du combat"
                      : `${buff.duration} tour${buff.duration > 1 ? "s" : ""}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
