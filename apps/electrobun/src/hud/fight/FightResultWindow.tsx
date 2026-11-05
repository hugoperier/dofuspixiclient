import type { FightResult, GameEnd } from "@dofus/proto/game_pb";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";

import type { InventoryState } from "@/game/stores/inventory-store";
import { ItemIcon } from "@/hud/inventory/ItemIcon";

import {
  durationLabel,
  experiencePercent,
  resultLayout,
} from "./fight-result-presentation";
import { RESULT } from "./fight-result-theme";
import "./fight-result.css";

export interface FightResultWindowProps {
  onClose: () => void;
  playArea: { width: number; height: number };
}

/** Same presentation used by the live HUD and the deterministic visual fixture. */
export function FightResultWindow({
  result,
  templates,
  onClose,
  playArea,
}: FightResultWindowProps & {
  result: GameEnd;
  templates: InventoryState["templates"];
}) {
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);
  const { winners, losers, panelHeight, scale } = resultLayout(
    result,
    playArea.width,
    playArea.height
  );
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);
  return (
    <div
      className="fight-result-overlay"
      style={{ width: playArea.width, height: playArea.height }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fight-result"
        style={{
          width: RESULT.width,
          height: panelHeight,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            event.preventDefault();
            onClose();
          }
          if (event.key !== "Tab") {
            return;
          }
          const elements = dialog.current?.querySelectorAll<HTMLElement>(
            'button, [tabindex="0"]'
          );
          if (!elements?.length) {
            return;
          }
          const first = elements[0];
          const last = elements[elements.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === dialog.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <button type="button" className="fight-result-close" onClick={onClose}>
          Fermer
        </button>
        <div className="fight-result-frame">
          <header className="fight-result-title">
            <h2 id={titleId}>Résultat du combat</h2>
            <span>{durationLabel(result.durationMs)}</span>
          </header>
          <div className="fight-result-body">
            <div className="fight-result-heading fight-result-winners">
              <h3>Gagnants</h3>
              {result.challenges.length > 0 && (
                <div className="fight-result-challenges">
                  <span>Bonus de challenges :</span>
                  {result.challenges.map((challenge) => (
                    <Tip
                      key={challenge.challengeId}
                      text={`${challenge.name || `Challenge ${challenge.challengeId}`}\n${challenge.succeeded ? "Réussi" : "Échoué"}\nXP : +${challenge.xpBonusPct}%\nButin : +${challenge.dropBonusPct}%`}
                    >
                      <img
                        src={`${RESULT.assets}/challenge-${challenge.succeeded ? "succeeded" : "failed"}.svg`}
                        width={21}
                        height={21}
                        alt={
                          challenge.succeeded
                            ? "Challenge réussi"
                            : "Challenge échoué"
                        }
                      />
                    </Tip>
                  ))}
                </div>
              )}
            </div>
            <ResultTeam
              entries={winners}
              templates={templates}
              label="Gagnants"
            />
            <div className="fight-result-heading fight-result-losers">
              <h3>Perdants</h3>
            </div>
            <ResultTeam
              entries={losers}
              templates={templates}
              label="Perdants"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Tip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  const place = (element: HTMLElement) => {
    const panel = element.closest(".fight-result");
    const tooltip = element.querySelector<HTMLElement>('[role="tooltip"]');
    if (!panel || !tooltip) {
      return;
    }
    const bounds = panel.getBoundingClientRect();
    const anchor = element.getBoundingClientRect();
    const scale = bounds.width / RESULT.width;
    if (!scale) {
      return;
    }
    const tooltipWidth = tooltip.getBoundingClientRect().width / scale;
    tooltip.style.left = `${Math.max(4, Math.min((anchor.right - bounds.left) / scale + 9, RESULT.width - tooltipWidth - 8))}px`;
    tooltip.style.top = `${Math.max(4, Math.min((anchor.top - bounds.top) / scale + 2, bounds.height / scale - tooltip.getBoundingClientRect().height / scale - 4))}px`;
  };
  return (
    <button
      type="button"
      aria-label={text}
      className="fight-result-tip"
      aria-describedby={id}
      onPointerEnter={(event) => place(event.currentTarget)}
      onFocus={(event) => place(event.currentTarget)}
    >
      {children}
      <span id={id} role="tooltip" className="fight-result-tooltip">
        {text}
      </span>
    </button>
  );
}

function ResultTeam({
  entries,
  templates,
  label,
}: {
  entries: FightResult[];
  templates: InventoryState["templates"];
  label: string;
}) {
  return (
    <table
      aria-label={label}
      className="fight-result-table"
      style={{ "--result-columns": RESULT.columns } as CSSProperties}
    >
      <thead>
        <tr className="fight-result-columns">
          {[
            "Nom",
            "Niv.",
            "XP gagnée",
            "Guilde",
            "Monture",
            "Kamas",
            "Objets gagnés",
          ].map((name) => (
            <th key={name} scope="col">
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody
        className="fight-result-rows"
        style={{ maxHeight: RESULT.visibleRows * RESULT.rowHeight }}
      >
        {entries.map((entry) => (
          <ResultRow key={entry.spriteId} entry={entry} templates={templates} />
        ))}
      </tbody>
    </table>
  );
}

function ResultRow({
  entry,
  templates,
}: {
  entry: FightResult;
  templates: InventoryState["templates"];
}) {
  // Older GE frames have no kind. Preserve their supplied rewards, but never
  // manufacture a gauge from the local character's XP for other participants.
  const rewards = entry.isPlayer !== false;
  const items = entry.itemsWon;
  const capacity = 12;
  const overflow = items.length > capacity;
  const itemLabel = (item: (typeof items)[number]) =>
    `${item.quantity} x ${templates.get(item.itemId)?.name ?? `Objet ${item.itemId}`}`;
  return (
    <tr className="fight-result-row">
      <td className="fight-result-name" title={entry.name}>
        {entry.isDead && (
          <img
            className="fight-result-dead"
            src={`${RESULT.assets}/dead.svg`}
            alt="Mort"
          />
        )}
        <span>{entry.name}</span>
      </td>
      <td className="fight-result-level">{entry.level}</td>
      <td className="fight-result-xp">
        {entry.experience && (
          <Tip
            text={
              entry.experience.nextLevelFloor === undefined
                ? `${entry.experience.current} XP — Niveau maximum`
                : `${entry.experience.current} / ${entry.experience.nextLevelFloor} XP`
            }
          >
            <span
              role="progressbar"
              aria-label={`Progression de ${entry.name}`}
              aria-valuenow={experiencePercent(entry.experience)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="fight-result-gauge"
            >
              <span
                style={{ width: `${experiencePercent(entry.experience)}%` }}
              />
            </span>
          </Tip>
        )}
        <span>
          {rewards && (entry.isPlayer || entry.xpWon !== 0n)
            ? String(entry.xpWon)
            : ""}
        </span>
      </td>
      {[entry.xpGuild, entry.xpMount, entry.kamaWon].map((value, index) => (
        <td
          className="fight-result-number"
          key={["guild", "mount", "kamas"][index]}
        >
          {rewards && value !== 0n ? String(value) : ""}
        </td>
      ))}
      <td className="fight-result-items">
        {items.slice(0, overflow ? capacity - 1 : capacity).map((item) => {
          const template = templates.get(item.itemId);
          return (
            <Tip key={item.itemId} text={itemLabel(item)}>
              {template ? (
                <ItemIcon
                  typeId={template.typeId}
                  gfxId={template.gfxId}
                  size={20}
                />
              ) : (
                <span className="fight-result-unknown">?</span>
              )}
            </Tip>
          );
        })}
        {overflow && (
          <Tip text={items.map(itemLabel).join("\n")}>
            <img
              src={`${RESULT.assets}/all-drops.svg`}
              width={20}
              height={20}
              alt="Tous les objets gagnés"
            />
          </Tip>
        )}
      </td>
    </tr>
  );
}
