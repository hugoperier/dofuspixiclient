import { create } from "@bufbuild/protobuf";
import {
  AdminChangeResourceCommandSchema,
  type AdminCommandRequest,
  AdminCommandRequestSchema,
  AdminCommandSource,
  AdminCommandStatus,
  AdminGrantItemCommandSchema,
  AdminItemRoll,
  AdminResourceKind,
  AdminResourceMode,
  AdminRestoreCommandSchema,
  AdminRestoreKind,
  AdminSetLevelCommandSchema,
  AdminTargetRefSchema,
  AdminTeleportCommandSchema,
  AdminTeleportMode,
} from "@dofus/proto/admin_pb";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { type CraftItemInfo, loadCraftsLang } from "@/game/lang/crafts-lang";
import { loadMapsLang } from "@/game/lang/maps-lang";
import {
  adminStore,
  closeAdminDrawer,
  requestAdminTarget,
  selectAdminTarget,
  setAdminPending,
} from "@/game/stores/admin-store";
import { useGameClient } from "@/hud/contexts/GameClientContext";

type CommandId =
  | "tp-to"
  | "tp-here"
  | "tp-map"
  | "give"
  | "resource"
  | "level"
  | "restore";

interface MapOption {
  id: number;
  label: string;
}

const COMMANDS: Array<{
  id: CommandId;
  label: string;
  category: string;
  sensitive?: boolean;
}> = [
  { id: "tp-to", label: "Me téléporter", category: "Téléportation" },
  {
    id: "tp-here",
    label: "Rappeler la cible",
    category: "Téléportation",
    sensitive: true,
  },
  {
    id: "tp-map",
    label: "Vers une carte",
    category: "Téléportation",
    sensitive: true,
  },
  { id: "give", label: "Donner un objet", category: "Inventaire" },
  { id: "resource", label: "Ressources", category: "Progression" },
  {
    id: "level",
    label: "Fixer le niveau",
    category: "Progression",
    sensitive: true,
  },
  { id: "restore", label: "Restaurer", category: "État" },
];

export function AdminDrawer() {
  const gameClient = useGameClient();
  const state = useSyncExternalStore(
    adminStore.subscribe,
    adminStore.getSnapshot
  );
  const [query, setQuery] = useState("");
  const [commandId, setCommandId] = useState<CommandId>("tp-to");
  const [items, setItems] = useState<CraftItemInfo[]>([]);
  const [maps, setMaps] = useState<MapOption[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [item, setItem] = useState<CraftItemInfo | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [roll, setRoll] = useState(AdminItemRoll.NORMAL);
  const [mapQuery, setMapQuery] = useState("");
  const [map, setMap] = useState<MapOption | null>(null);
  const [cellId, setCellId] = useState(0);
  const [resource, setResource] = useState(AdminResourceKind.KAMAS);
  const [mode, setMode] = useState(AdminResourceMode.ADD);
  const [amount, setAmount] = useState("1");
  const [level, setLevel] = useState(1);
  const [restore, setRestore] = useState(AdminRestoreKind.ALL);

  useEffect(() => {
    let active = true;
    void Promise.all([loadCraftsLang(), loadMapsLang()]).then(
      ([crafts, mapData]) => {
        if (!active) {
          return;
        }
        setItems([...crafts.items.values()]);
        setMaps(
          [...mapData.maps.entries()].map(([id, value]) => ({
            id,
            label: `#${id} · [${value.x}, ${value.y}]`,
          }))
        );
      }
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onRequested = (event: Event) => {
      const playerId = (event as CustomEvent<{ playerId: string }>).detail
        .playerId;
      gameClient?.searchAdminPlayers(`#${playerId}`);
    };
    window.addEventListener("dofus:admin-target-requested", onRequested);
    return () =>
      window.removeEventListener("dofus:admin-target-requested", onRequested);
  }, [gameClient]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isTyping(event.target)) {
        closeAdminDrawer();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const itemResults = useMemo(() => {
    const needle = itemQuery.trim().toLocaleLowerCase("fr");
    if (!needle || item) {
      return [];
    }
    return items
      .filter(
        (entry) =>
          String(entry.id) === needle.replace(/^#/, "") ||
          entry.name.toLocaleLowerCase("fr").includes(needle)
      )
      .slice(0, 8);
  }, [item, itemQuery, items]);

  const mapResults = useMemo(() => {
    const needle = mapQuery.trim().toLocaleLowerCase("fr");
    if (!needle || map) {
      return [];
    }
    return maps
      .filter(
        (entry) =>
          String(entry.id) === needle.replace(/^#/, "") ||
          entry.label.toLocaleLowerCase("fr").includes(needle)
      )
      .slice(0, 8);
  }, [map, mapQuery, maps]);

  if (!state.enabled || !state.isOpen) {
    return null;
  }

  const submitSearch = () => {
    if (query.trim()) {
      gameClient?.searchAdminPlayers(query.trim());
    }
  };

  const send = (command: AdminCommandRequest["command"]) => {
    const target = state.selectedTarget;
    if (!target) {
      return;
    }
    gameClient?.executeAdminCommand(
      create(AdminCommandRequestSchema, {
        requestId: crypto.randomUUID(),
        source: AdminCommandSource.DRAWER,
        confirmed: false,
        target: create(AdminTargetRefSchema, {
          identifier: { case: "playerId", value: target.playerId },
        }),
        command,
      })
    );
  };

  const confirm = () => {
    const pending = state.pending;
    if (!pending) {
      return;
    }
    gameClient?.executeAdminCommand(
      create(AdminCommandRequestSchema, {
        requestId: pending.request.requestId,
        source: pending.request.source,
        confirmed: true,
        target: pending.request.target,
        command: pending.request.command,
      })
    );
  };

  return (
    <div className="absolute inset-0 z-[90] bg-black/30">
      <button
        type="button"
        aria-label="Fermer le menu administrateur"
        className="absolute inset-0 cursor-default"
        onClick={closeAdminDrawer}
      />
      <aside className="absolute top-2 right-2 bottom-2 flex w-[390px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border border-lime-300/25 bg-[#24271f]/98 text-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[9px] font-black tracking-[0.22em] text-lime-300 uppercase">
              Administration
            </p>
            <h1 className="text-lg font-black">Actions rapides</h1>
          </div>
          <button
            type="button"
            onClick={closeAdminDrawer}
            className="rounded-lg bg-white/5 px-3 py-2 text-xs"
          >
            Fermer
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submitSearch()}
              placeholder="Nom, partie du nom ou #ID"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs outline-none focus:border-lime-300/50"
            />
            <button
              type="button"
              onClick={submitSearch}
              className="rounded-lg bg-lime-400 px-3 text-xs font-black text-[#20251a]"
            >
              {state.searching ? "…" : "Chercher"}
            </button>
            <button
              type="button"
              onClick={() => {
                requestAdminTarget(state.selfPlayerId);
                gameClient?.searchAdminPlayers(`#${state.selfPlayerId}`);
              }}
              className="rounded-lg border border-white/10 px-3 text-xs font-bold"
            >
              Moi
            </button>
          </div>

          {state.searchResults.length > 0 && (
            <div className="mt-2 max-h-36 overflow-auto rounded-lg border border-white/10 bg-black/20">
              {state.searchResults.map((player) => (
                <button
                  key={player.playerId}
                  type="button"
                  onClick={() => selectAdminTarget(player)}
                  className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-xs hover:bg-white/5"
                >
                  <span>
                    <b>{player.playerName}</b>
                    <small className="ml-2 text-white/35">
                      #{player.playerId}
                    </small>
                  </span>
                  <span
                    className={
                      player.online ? "text-emerald-300" : "text-white/35"
                    }
                  >
                    {player.online ? "En ligne" : "Hors ligne"}
                  </span>
                </button>
              ))}
            </div>
          )}

          <section className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            {state.selectedTarget ? (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-black">
                      {state.selectedTarget.playerName}
                    </h2>
                    <p className="text-[10px] text-white/45">
                      Compte {state.selectedTarget.accountPseudo} · #
                      {state.selectedTarget.accountId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void navigator.clipboard?.writeText(
                        state.selectedTarget?.playerId ?? ""
                      )
                    }
                    className="rounded bg-black/25 px-2 py-1 font-mono text-[10px] text-lime-200"
                  >
                    #{state.selectedTarget.playerId} · copier
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
                  <Metric
                    label="Statut"
                    value={
                      state.selectedTarget.online ? "Connecté" : "Hors ligne"
                    }
                  />
                  <Metric
                    label="Position"
                    value={`${state.selectedTarget.mapId}/${state.selectedTarget.cellId}`}
                  />
                  <Metric
                    label="Niveau"
                    value={String(state.selectedTarget.level)}
                  />
                  <Metric
                    label="Kamas"
                    value={format(state.selectedTarget.kamas)}
                  />
                  <Metric
                    label="XP"
                    value={format(state.selectedTarget.experience)}
                  />
                  <Metric
                    label="Capitaux"
                    value={`${state.selectedTarget.statPoints}/${state.selectedTarget.spellPoints}`}
                  />
                </div>
              </>
            ) : (
              <p className="py-5 text-center text-xs text-white/35">
                Aucune cible sélectionnée.
              </p>
            )}
          </section>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {COMMANDS.map((command) => (
              <button
                key={command.id}
                type="button"
                onClick={() => setCommandId(command.id)}
                className={`rounded-lg px-3 py-2 text-left text-[10px] ${commandId === command.id ? "bg-lime-400 text-[#20251a]" : "bg-white/5 text-white/65"}`}
              >
                <b className="block">{command.label}</b>
                <span className="text-[8px] uppercase opacity-60">
                  {command.category}
                  {command.sensitive ? " · sensible" : ""}
                </span>
              </button>
            ))}
          </div>

          <section className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            {renderForm()}
          </section>

          <h3 className="mt-4 text-[9px] font-black tracking-[0.2em] text-white/35 uppercase">
            Dernières actions
          </h3>
          <div className="mt-2 space-y-1.5">
            {state.activity.length === 0 && (
              <p className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[10px] text-white/25">
                Aucune action.
              </p>
            )}
            {state.activity.slice(0, 8).map(({ id, at, response }) => (
              <div
                key={id}
                className="rounded-lg bg-white/5 px-3 py-2 text-[10px]"
              >
                <div className="flex gap-2">
                  <span className={statusColor(response.status)}>●</span>
                  <span className="min-w-0 flex-1 truncate">
                    {response.message}
                  </span>
                  <time className="font-mono text-white/25">
                    {at.toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="border-t border-white/10 px-4 py-2 text-[9px] text-white/30">
          SESSION AUTHENTIFIÉE · COMMANDES AUDITÉES
        </footer>

        {state.pending && (
          <div className="absolute inset-0 z-10 flex items-end bg-black/70 p-3">
            <div className="w-full rounded-xl border border-amber-300/40 bg-[#343126] p-4">
              <p className="text-[9px] font-black tracking-widest text-amber-300 uppercase">
                Confirmer l’action sensible
              </p>
              <p className="mt-2 rounded-lg bg-black/20 p-3 text-xs text-white/70">
                {state.pending.message}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdminPending(null)}
                  className="rounded-lg border border-white/10 px-3 py-2 text-xs"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-[#302718]"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );

  function renderForm() {
    const disabled = !state.selectedTarget;
    if (commandId === "tp-to" || commandId === "tp-here") {
      const teleportMode =
        commandId === "tp-to"
          ? AdminTeleportMode.SELF_TO_TARGET
          : AdminTeleportMode.TARGET_TO_SELF;
      return (
        <ActionButton
          disabled={disabled}
          sensitive={commandId === "tp-here"}
          onClick={() =>
            send({
              case: "teleport",
              value: create(AdminTeleportCommandSchema, { mode: teleportMode }),
            })
          }
        >
          {commandId === "tp-to"
            ? "Me téléporter vers la cible"
            : "Rappeler la cible vers moi"}
        </ActionButton>
      );
    }
    if (commandId === "tp-map") {
      return (
        <>
          <input
            value={mapQuery}
            onChange={(event) => {
              setMapQuery(event.target.value);
              setMap(null);
            }}
            placeholder="Carte ou #ID"
            className={inputClass}
          />
          {mapResults.length > 0 && (
            <Results>
              {mapResults.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setMap(entry);
                    setMapQuery(entry.label);
                  }}
                  className={resultClass}
                >
                  {entry.label}
                </button>
              ))}
            </Results>
          )}
          <input
            type="number"
            min={0}
            value={cellId}
            onChange={(event) => setCellId(Number(event.target.value))}
            placeholder="Cellule"
            className={`${inputClass} mt-2`}
          />
          <ActionButton
            sensitive
            disabled={disabled || !map}
            onClick={() =>
              map &&
              send({
                case: "teleport",
                value: create(AdminTeleportCommandSchema, {
                  mode: AdminTeleportMode.TARGET_TO_MAP,
                  mapId: map.id,
                  cellId,
                }),
              })
            }
          >
            Téléporter vers la carte
          </ActionButton>
        </>
      );
    }
    if (commandId === "give") {
      return (
        <>
          <input
            value={itemQuery}
            onChange={(event) => {
              setItemQuery(event.target.value);
              setItem(null);
            }}
            placeholder="Objet ou #ID"
            className={inputClass}
          />
          {itemResults.length > 0 && (
            <Results>
              {itemResults.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setItem(entry);
                    setItemQuery(`${entry.name} · #${entry.id}`);
                  }}
                  className={resultClass}
                >
                  {entry.name} · #{entry.id}
                </button>
              ))}
            </Results>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              className={inputClass}
            />
            <select
              value={roll}
              onChange={(event) =>
                setRoll(Number(event.target.value) as AdminItemRoll)
              }
              className={inputClass}
            >
              <option value={AdminItemRoll.NORMAL}>Normal</option>
              <option value={AdminItemRoll.PERFECT}>Parfait</option>
              <option value={AdminItemRoll.EMPTY}>Vide</option>
            </select>
          </div>
          <ActionButton
            disabled={disabled || !item || quantity < 1}
            onClick={() =>
              item &&
              send({
                case: "grantItem",
                value: create(AdminGrantItemCommandSchema, {
                  itemId: item.id,
                  quantity,
                  roll,
                }),
              })
            }
          >
            Donner l’objet
          </ActionButton>
        </>
      );
    }
    if (commandId === "resource") {
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={resource}
              onChange={(event) =>
                setResource(Number(event.target.value) as AdminResourceKind)
              }
              className={inputClass}
            >
              <option value={AdminResourceKind.KAMAS}>Kamas</option>
              <option value={AdminResourceKind.XP}>XP</option>
              <option value={AdminResourceKind.STAT_POINTS}>
                Caractéristiques
              </option>
              <option value={AdminResourceKind.SPELL_POINTS}>Sorts</option>
            </select>
            <select
              value={mode}
              onChange={(event) =>
                setMode(Number(event.target.value) as AdminResourceMode)
              }
              className={inputClass}
            >
              <option value={AdminResourceMode.ADD}>Ajouter</option>
              <option value={AdminResourceMode.REMOVE}>Retirer</option>
              <option value={AdminResourceMode.SET}>Fixer</option>
            </select>
          </div>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={`${inputClass} mt-2`}
          />
          <ActionButton
            sensitive={mode !== AdminResourceMode.ADD}
            disabled={disabled || !/^\d+$/.test(amount)}
            onClick={() =>
              send({
                case: "changeResource",
                value: create(AdminChangeResourceCommandSchema, {
                  resource,
                  mode,
                  amount,
                }),
              })
            }
          >
            Appliquer la ressource
          </ActionButton>
        </>
      );
    }
    if (commandId === "level") {
      return (
        <>
          <input
            type="number"
            min={1}
            max={200}
            value={level}
            onChange={(event) => setLevel(Number(event.target.value))}
            className={inputClass}
          />
          <p className="mt-2 text-[9px] text-lime-200/60">
            XP, capitaux et sorts seront réconciliés.
          </p>
          <ActionButton
            sensitive
            disabled={disabled || level < 1 || level > 200}
            onClick={() =>
              send({
                case: "setLevel",
                value: create(AdminSetLevelCommandSchema, { level }),
              })
            }
          >
            Fixer le niveau
          </ActionButton>
        </>
      );
    }
    return (
      <>
        <select
          value={restore}
          onChange={(event) =>
            setRestore(Number(event.target.value) as AdminRestoreKind)
          }
          className={inputClass}
        >
          <option value={AdminRestoreKind.ALL}>Vie et énergie</option>
          <option value={AdminRestoreKind.LIFE}>Vie</option>
          <option value={AdminRestoreKind.ENERGY}>Énergie</option>
        </select>
        <ActionButton
          disabled={disabled}
          onClick={() =>
            send({
              case: "restore",
              value: create(AdminRestoreCommandSchema, { kind: restore }),
            })
          }
        >
          Restaurer la cible
        </ActionButton>
      </>
    );
  }
}

const inputClass =
  "w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs outline-none focus:border-lime-300/50";
const resultClass =
  "block w-full border-b border-white/5 px-2 py-1.5 text-left text-[10px] text-white/65 hover:bg-white/10";

function Results({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1 max-h-28 overflow-auto rounded-md border border-white/10 bg-[#20221c]">
      {children}
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  sensitive,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  sensitive?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-black disabled:opacity-30 ${sensitive ? "bg-amber-500 text-[#302718]" : "bg-lime-400 text-[#20251a]"}`}
    >
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/20 p-2">
      <span className="block text-[8px] uppercase text-white/30">{label}</span>
      <b className="mt-0.5 block truncate">{value}</b>
    </div>
  );
}

function format(value: string): string {
  try {
    return new Intl.NumberFormat("fr-FR").format(BigInt(value));
  } catch {
    return value;
  }
}

function statusColor(status: AdminCommandStatus): string {
  if (status === AdminCommandStatus.SUCCESS) {
    return "text-emerald-400";
  }
  if (status === AdminCommandStatus.CONFIRMATION_REQUIRED) {
    return "text-amber-400";
  }
  return "text-red-400";
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable)
  );
}
