import type { CSSProperties } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { GameClient } from "@/game/game-client";
import type { CraftRecipe, CraftsLang } from "@/game/lang/crafts-lang";
import type { JobsLang } from "@/game/lang/jobs-lang";
import type { JobSkill, PlayerJob } from "@/game/stores/jobs-store";
import { JobIcon } from "@/components/ui/icons/banner/job";
import { craftRecipeTone, loadCraftsLang } from "@/game/lang/crafts-lang";
import { loadJobsLang } from "@/game/lang/jobs-lang";
import { getJobs, JobOptionBit, jobsStore } from "@/game/stores/jobs-store";

import { Panel } from "../components/Panel";
import { CRAFT_COLORS } from "../craft/craft-theme";
import { ItemIcon } from "../inventory/ItemIcon";

const C = CRAFT_COLORS;

interface JobsPanelProps {
  onClose: () => void;
  zoom?: number;
  gameClient?: GameClient | null;
}

/**
 * The three flags of `JobOptions`, in the order the retail tab lists them.
 *
 * Setting any of them is also what puts the artisan in the craftsmen's book
 * — 1.29 has no separate registration — which is why the panel says so
 * rather than showing a fourth, imaginary, checkbox.
 */
const OPTION_LABELS: readonly [bit: number, label: string][] = [
  [JobOptionBit.Paid, "Je fais payer"],
  [JobOptionBit.FreeOnFailure, "Gratuit si j'échoue"],
  [JobOptionBit.ClientSupplies, "Le client fournit"],
];

/**
 * Base units. The play area above the banner is 742×432
 * (`DISPLAY_WIDTH`/`DISPLAY_HEIGHT`), so this is very nearly all of it —
 * the recipe column is the point of the window and it needs the room to
 * name ingredients rather than only show their icons.
 */
const WIDTH = 700;
const HEIGHT = 412;
const PAD = 8;
const GAP = 8;
const LEFT_WIDTH = 290;

/** Retail keeps three specialisation slots, filled or not. */
const SPECIALISATION_SLOTS = 3;

/**
 * A recipe line's height, from its ingredient count: two chips per line,
 * plus the result's own two lines. Rows are not all the same height, but
 * every one of them is a pure function of the recipe — which is what lets
 * the list window itself without measuring anything.
 */
const RECIPE_HEAD_H = 26;
const RECIPE_CHIP_H = 15;
const RECIPE_CHIP_COLUMNS = 2;

function recipeRowHeight(ingredients: number): number {
  return (
    RECIPE_HEAD_H +
    Math.ceil(ingredients / RECIPE_CHIP_COLUMNS) * RECIPE_CHIP_H +
    6
  );
}

/** Rows drawn above and below the viewport, so a fast drag never tears. */
const RECIPE_OVERSCAN = 3;

/** The ingredient-count filters retail puts under the search field. */
const SLOT_FILTERS = [2, 3, 4, 5, 6, 7, 8] as const;

/**
 * The Métiers window.
 *
 * Two columns, as in 1.29: on the left the jobs the character holds — one
 * tile each, then the selected one's gauge and its skill list; on the right
 * every recipe that job's craft skills know, searchable and filterable by
 * ingredient count.
 *
 * Everything on the left arrives on the `J` channel: `JS` the skill lists,
 * `JX` the level and the two ends of the gauge. Nothing is computed — the
 * client does not hold the job experience curve and must not appear to, or
 * the bar and the server would drift apart the moment the table changed.
 *
 * Everything on the right is lang data (`skills.json`, `crafts.json`,
 * `items.json`): a recipe book lists ingredients the player has never held,
 * so the server's `ItemTemplateData` cannot name them.
 *
 * The 1.29 window carries a per-job icon from `clips/jobs/<g>.swf`. Those
 * SWFs have never been extracted (`assets/sources/clips/` holds only
 * `sprites/`), so each tile stands in the icon of what the job is *for* —
 * the first thing it gathers, or the cheapest thing it makes. That is a
 * boot for a Cordonnier and a plank for a Bûcheron, which is close enough
 * to retail's own glyphs to tell three tiles apart at a glance.
 */
export function JobsPanel({
  onClose,
  zoom = 1,
  gameClient = null,
}: JobsPanelProps) {
  const state = useSyncExternalStore(
    jobsStore.subscribe,
    jobsStore.getSnapshot
  );
  const jobs = getJobs(state);

  const [jobsLang, setJobsLang] = useState<JobsLang | null>(null);
  // The item table, for the resource a harvest skill yields and for every
  // recipe on the right. `SK[id].d` is the *verb* — sixteen of a Bûcheron's
  // skills are called "Couper" and nothing else — so the panel read as
  // sixteen identical lines and told a player nothing about what they could
  // cut (QA-162).
  const [craftsLang, setCraftsLang] = useState<CraftsLang | null>(null);

  useEffect(() => {
    void loadJobsLang().then(setJobsLang);
    void loadCraftsLang().then(setCraftsLang);
  }, []);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  // A job the character just lost, or the very first list to arrive: fall
  // back to the first job rather than showing an empty right column.
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0] ?? null;

  const p = (n: number) => Math.round(n * zoom);

  return (
    <Panel
      title="Métiers"
      width={WIDTH}
      height={HEIGHT}
      onClose={onClose}
      zoom={zoom}
      floating
    >
      <div
        style={{
          display: "flex",
          gap: p(GAP),
          height: "100%",
          padding: p(PAD),
          boxSizing: "border-box",
          fontFamily: "Verdana, sans-serif",
          color: C.text,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: p(LEFT_WIDTH),
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: p(5),
            minHeight: 0,
          }}
        >
          {jobs.length === 0 ? (
            <div
              style={{
                margin: "auto",
                padding: p(12),
                fontSize: p(10),
                opacity: 0.7,
                textAlign: "center",
                lineHeight: 1.6,
              }}
            >
              Aucun métier appris.
              <br />
              Un maître de métier peut t'en enseigner un.
            </div>
          ) : (
            <>
              <JobTiles
                zoom={zoom}
                jobs={jobs}
                lang={jobsLang}
                craftsLang={craftsLang}
                selectedId={selected?.id ?? null}
                onSelect={(id) => {
                  setSelectedId(id);
                  setShowOptions(false);
                }}
              />

              {selected && (
                <>
                  <JobGauge zoom={zoom} job={selected} lang={jobsLang} />

                  <Framed
                    zoom={zoom}
                    title={showOptions ? "Options" : "Compétences"}
                  >
                    {showOptions ? (
                      <JobOptionsForm
                        zoom={zoom}
                        job={selected}
                        onChange={(options, minSlots) =>
                          gameClient?.setJobOptions(
                            selected.id,
                            options,
                            minSlots
                          )
                        }
                      />
                    ) : (
                      <SkillList
                        zoom={zoom}
                        job={selected}
                        jobsLang={jobsLang}
                        craftsLang={craftsLang}
                      />
                    )}
                  </Framed>

                  <WideButton
                    zoom={zoom}
                    disabled={!selected.skills.some((s) => s.slots > 0)}
                    label={showOptions ? "Compétences" : "Options du métier"}
                    onClick={() => setShowOptions(!showOptions)}
                  />
                </>
              )}
            </>
          )}
        </div>

        <RecipeColumn
          key={selected?.id ?? "none"}
          zoom={zoom}
          job={selected}
          jobsLang={jobsLang}
          craftsLang={craftsLang}
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Left column
 * ------------------------------------------------------------------ */

/**
 * One tile per job, plus the specialisation box retail keeps beside them.
 *
 * `J[id].s` is the job a specialisation refines. The box always draws its
 * three slots, filled or not — that is how 1.29 says "you have room for
 * three of these", which an empty box that grows on demand would not.
 */
function JobTiles({
  zoom,
  jobs,
  lang,
  craftsLang,
  selectedId,
  onSelect,
}: {
  zoom: number;
  jobs: readonly PlayerJob[];
  lang: JobsLang | null;
  craftsLang: CraftsLang | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const isSpecialisation = (job: PlayerJob) =>
    (lang?.jobs.get(job.id)?.specializationOf ?? 0) !== 0;

  const base = jobs.filter((job) => !isSpecialisation(job));
  const specialised = jobs.filter(isSpecialisation);

  return (
    <div style={{ display: "flex", gap: p(6), alignItems: "flex-start" }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: p(4),
        }}
      >
        {base.map((job) => (
          <JobTile
            key={job.id}
            zoom={zoom}
            job={job}
            lang={lang}
            craftsLang={craftsLang}
            selected={job.id === selectedId}
            onSelect={() => onSelect(job.id)}
          />
        ))}
      </div>

      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: p(9), marginBottom: p(2) }}>
          Spécialisations
        </div>
        <div
          style={{
            display: "flex",
            gap: p(4),
            padding: p(3),
            boxSizing: "border-box",
            background: "rgba(0, 0, 0, 0.07)",
            border: `${p(1)}px solid rgba(0, 0, 0, 0.25)`,
            borderRadius: p(3),
          }}
        >
          {Array.from({ length: SPECIALISATION_SLOTS }, (_, index) => {
            const job = specialised[index];

            return job ? (
              <JobTile
                key={job.id}
                zoom={zoom}
                job={job}
                lang={lang}
                craftsLang={craftsLang}
                selected={job.id === selectedId}
                onSelect={() => onSelect(job.id)}
              />
            ) : (
              <EmptySlot key={`empty-${index}`} zoom={zoom} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function JobTile({
  zoom,
  job,
  lang,
  craftsLang,
  selected,
  onSelect,
}: {
  zoom: number;
  job: PlayerJob;
  lang: JobsLang | null;
  craftsLang: CraftsLang | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const name = lang?.jobs.get(job.id)?.name ?? `Métier ${job.id}`;
  const icon = jobIconItem(job, lang, craftsLang);

  return (
    <button
      type="button"
      title={`${name} — niveau ${job.level}`}
      onClick={onSelect}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: p(1),
        padding: 0,
        border: "none",
        background: "none",
        cursor: "pointer",
        color: "inherit",
        fontFamily: "inherit",
      }}
    >
      <span
        style={{
          width: p(30),
          height: p(30),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxSizing: "border-box",
          borderRadius: p(3),
          background: selected ? "#efe9c8" : "#c6c0a2",
          flexShrink: 0,
          border: `${p(2)}px solid ${selected ? C.orange : "rgba(0,0,0,0.3)"}`,
        }}
      >
        {icon ? (
          <ItemIcon
            typeId={icon.typeId}
            gfxId={icon.gfxId}
            size={p(26)}
            alt={name}
          />
        ) : (
          // The bundles are still loading, or the job gathers something
          // with no published icon: the banner's own glyph stands in.
          <span
            style={{
              transform: `scale(${(zoom * 22) / 28.5})`,
              transformOrigin: "center",
              display: "flex",
            }}
          >
            <JobIcon />
          </span>
        )}
      </span>
      <span style={{ fontSize: p(8) }}>Niv. {job.level}</span>
    </button>
  );
}

/** An unclaimed specialisation slot — the box always draws all three. */
function EmptySlot({ zoom }: { zoom: number }) {
  const p = (n: number) => Math.round(n * zoom);

  return (
    <span
      style={{
        width: p(30),
        height: p(30),
        flexShrink: 0,
        boxSizing: "border-box",
        borderRadius: p(3),
        background: "rgba(0, 0, 0, 0.12)",
        border: `${p(2)}px solid rgba(0, 0, 0, 0.2)`,
      }}
    />
  );
}

/**
 * What a job's tile shows, standing in for the unextracted `clips/jobs`
 * glyph: the first thing the job gathers, or — for a pure craft job — the
 * cheapest thing it makes. `orderSkills` already puts the gathering skills
 * first and by level, so the first of them is the job's own starting
 * resource, which is exactly the recognisable one.
 */
function jobIconItem(
  job: PlayerJob,
  lang: JobsLang | null,
  craftsLang: CraftsLang | null
) {
  if (!lang || !craftsLang) {
    return null;
  }

  for (const skill of orderSkills(job.skills)) {
    const text = lang.skills.get(skill.id);
    const icon = skillIconItem(
      skill,
      text?.harvestItemId ?? null,
      text?.craftItemIds ?? [],
      craftsLang
    );

    if (icon) {
      return icon;
    }
  }

  return null;
}

/**
 * The selected job's name, level and experience bar.
 *
 * `xpMax === xpMin` is how the server spells "at the ceiling"; a full bar is
 * the honest reading, and it avoids dividing by zero.
 */
function JobGauge({
  zoom,
  job,
  lang,
}: {
  zoom: number;
  job: PlayerJob;
  lang: JobsLang | null;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const name = lang?.jobs.get(job.id)?.name ?? `Métier ${job.id}`;
  const filled = jobProgress(job);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: p(3) }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontSize: p(11),
          fontWeight: "bold",
        }}
      >
        <span>{name}</span>
        <span style={{ fontWeight: "normal", fontSize: p(10) }}>
          Niveau {job.level}
        </span>
      </div>

      <div
        title={`${job.experience} / ${job.xpMax}`}
        style={{
          position: "relative",
          height: p(9),
          borderRadius: p(2),
          background: C.gaugeTrack,
          border: `${p(1)}px solid rgba(0, 0, 0, 0.5)`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${filled * 100}%`,
            background: C.success,
          }}
        />
      </div>
    </div>
  );
}

/** How far into the current level the job is, as the server's own window. */
function jobProgress(job: PlayerJob): number {
  const span = job.xpMax - job.xpMin;

  if (span <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(0, (job.experience - job.xpMin) / span));
}

/** A captioned, sunken box — the frame 1.29 draws around a list. */
function Framed({
  zoom,
  title,
  children,
}: {
  zoom: number;
  title: string;
  children: React.ReactNode;
}) {
  const p = (n: number) => Math.round(n * zoom);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        border: `${p(1)}px solid rgba(0, 0, 0, 0.3)`,
        borderRadius: p(4),
        background: "rgba(255, 255, 255, 0.18)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: `${p(3)}px ${p(6)}px`,
          fontSize: p(10),
          fontWeight: "bold",
        }}
      >
        {title}
      </div>
      <div
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        onWheel={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The job's skills: what it can gather, and what it can make.
 *
 * Harvest skills come first, by required level, craft skills after them
 * (QA-162). `JS` sends them in the referential's own order, which is
 * neither: a Bûcheron's list read 1, 30, 50, 70, 90, 40, 80, 10, 20, 60,
 * then the workbench, then 35, 35, 50, 80, 100, 75. A craft skill's
 * `minLevel` is not comparable — its gate is the number of slots — so the
 * two groups are sorted apart rather than interleaved.
 */
function SkillList({
  zoom,
  job,
  jobsLang,
  craftsLang,
}: {
  zoom: number;
  job: PlayerJob;
  jobsLang: JobsLang | null;
  craftsLang: CraftsLang | null;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const percent = Math.round(jobProgress(job) * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {orderSkills(job.skills).map((skill, index) => {
        const text = jobsLang?.skills.get(skill.id);
        const verb = text?.label ?? `Compétence ${skill.id}`;
        const icon = skillIconItem(
          skill,
          text?.harvestItemId ?? null,
          text?.craftItemIds ?? [],
          craftsLang
        );
        // A craft skill is performed on a workbench and retail names it
        // under the verb; a harvest skill's second line is what it yields,
        // which is the only thing that tells sixteen "Couper" apart.
        const subtitle =
          skill.slots > 0
            ? ((text?.workbenchId != null
                ? jobsLang?.workbenches.get(text.workbenchId)
                : null) ?? "Atelier")
            : ((text?.harvestItemId != null
                ? craftsLang?.items.get(text.harvestItemId)?.name
                : null) ?? `Niveau ${skill.minLevel}`);

        return (
          <div
            key={skill.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: p(6),
              padding: `${p(4)}px ${p(6)}px`,
              background: index % 2 === 1 ? "rgba(0, 0, 0, 0.05)" : "none",
            }}
          >
            <span style={{ width: p(20), height: p(20), flexShrink: 0 }}>
              {icon && (
                <ItemIcon
                  typeId={icon.typeId}
                  gfxId={icon.gfxId}
                  size="100%"
                  alt=""
                />
              )}
            </span>

            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: p(9),
                  fontWeight: "bold",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {verb}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: p(8),
                  color: C.muted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {subtitle}
              </span>
            </span>

            <span
              style={{ flexShrink: 0, fontSize: p(9), whiteSpace: "nowrap" }}
            >
              {skill.slots > 0
                ? `${skill.slots} case${skill.slots > 1 ? "s" : ""} (${percent}%)`
                : `Niv. ${skill.minLevel}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The icon beside a skill line.
 *
 * A harvest skill has one obvious subject — the resource it yields. A craft
 * skill has none, so the cheapest thing it can make stands in for it, which
 * is what makes "Confectionner des Bottes" read as boots at a glance.
 */
function skillIconItem(
  skill: JobSkill,
  harvestItemId: number | null,
  craftItemIds: readonly number[],
  lang: CraftsLang | null
) {
  if (!lang) {
    return null;
  }

  if (skill.slots <= 0) {
    return harvestItemId == null
      ? null
      : (lang.items.get(harvestItemId) ?? null);
  }

  let cheapest: {
    level: number;
    item: NonNullable<ReturnType<typeof lang.items.get>>;
  } | null = null;

  for (const id of craftItemIds) {
    const item = lang.items.get(id);

    if (item && (cheapest === null || item.level < cheapest.level)) {
      cheapest = { level: item.level, item };
    }
  }

  return cheapest?.item ?? null;
}

function orderSkills(skills: readonly JobSkill[]): JobSkill[] {
  const harvest = skills.filter((skill) => skill.slots <= 0);
  const craft = skills.filter((skill) => skill.slots > 0);

  return [
    ...[...harvest].sort((a, b) => a.minLevel - b.minLevel || a.id - b.id),
    ...[...craft].sort((a, b) => a.slots - b.slots || a.id - b.id),
  ];
}

/**
 * One job's artisan terms.
 *
 * Every change sends the whole set — `JO` carries the bitmask and the
 * minimum together, and there is no frame for one of the two. Setting any
 * flag is also what lists the artisan in the craftsmen's book.
 */
function JobOptionsForm({
  zoom,
  job,
  onChange,
}: {
  zoom: number;
  job: PlayerJob;
  onChange: (options: number, minSlots: number) => void;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: p(5),
    padding: `${p(4)}px ${p(6)}px`,
    fontSize: p(9),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {OPTION_LABELS.map(([bit, label]) => (
        <label key={bit} style={rowStyle}>
          <input
            type="checkbox"
            checked={(job.options & bit) === bit}
            onChange={() => onChange(job.options ^ bit, job.minSlots)}
          />
          {label}
        </label>
      ))}

      <label style={rowStyle}>
        Ingrédients minimum
        <input
          type="number"
          min={2}
          max={8}
          value={job.minSlots}
          onChange={(e) =>
            onChange(job.options, Number.parseInt(e.target.value, 10) || 2)
          }
          style={{ width: p(38), fontSize: p(9) }}
        />
      </label>

      <div style={{ ...rowStyle, color: C.muted, lineHeight: 1.5 }}>
        Cocher une option inscrit l'artisan dans le livre des artisans.
      </div>
    </div>
  );
}

function WideButton({
  zoom,
  label,
  disabled,
  onClick,
}: {
  zoom: number;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const p = (n: number) => Math.round(n * zoom);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        flexShrink: 0,
        height: p(20),
        background: C.dark,
        color: C.darkText,
        border: `${p(2)}px solid #ffffff`,
        borderRadius: p(7),
        fontFamily: "inherit",
        fontSize: p(10),
        fontWeight: "bold",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Right column — the recipe book
 * ------------------------------------------------------------------ */

/** A recipe, plus the skill of the selected job that can make it. */
interface JobRecipe {
  recipe: CraftRecipe;
  skillLabel: string;
  /** The craft slots that skill offers — how many cells the line draws. */
  slots: number;
}

function RecipeColumn({
  zoom,
  job,
  jobsLang,
  craftsLang,
}: {
  zoom: number;
  job: PlayerJob | null;
  jobsLang: JobsLang | null;
  craftsLang: CraftsLang | null;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const [search, setSearch] = useState("");
  const [slotFilter, setSlotFilter] = useState<ReadonlySet<number>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Measured, not read during render: `clientHeight` is 0 on the first pass
  // and nothing would re-render to correct it, so the list would mount only
  // its overscan rows and look empty until the first scroll.
  const [viewport, setViewport] = useState(0);

  const attachList = useCallback((node: HTMLDivElement | null) => {
    listRef.current = node;
    setViewport(node?.clientHeight ?? 0);
  }, []);

  const backToTop = () => {
    listRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  };

  const all = useMemo(
    () => jobRecipes(job, jobsLang, craftsLang),
    [job, jobsLang, craftsLang]
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return all.filter(
      (entry) =>
        (needle === "" ||
          entry.recipe.resultName.toLowerCase().includes(needle)) &&
        (slotFilter.size === 0 ||
          slotFilter.has(entry.recipe.ingredients.length))
    );
  }, [all, search, slotFilter]);

  // The biggest bench this job owns: what the line colours are judged
  // against, exactly as the open workbench judges them.
  const maxSlots = job
    ? Math.max(0, ...job.skills.map((skill) => skill.slots))
    : 0;

  // Where every row starts, in base units, and where the last one ends.
  // Row heights differ — a two-ingredient recipe does not need the room an
  // eight-ingredient one does — so the offsets are summed once per list
  // rather than multiplied out of a single constant.
  const offsets = useMemo(() => {
    const acc = [0];

    for (const entry of visible) {
      const previous = acc[acc.length - 1] ?? 0;
      acc.push(previous + recipeRowHeight(entry.recipe.ingredients.length));
    }

    return acc;
  }, [visible]);

  const total = offsets[offsets.length - 1] ?? 0;
  const first = Math.max(
    0,
    firstRowAt(offsets, scrollTop / zoom) - RECIPE_OVERSCAN
  );
  const last = Math.min(
    visible.length,
    firstRowAt(offsets, (scrollTop + viewport) / zoom) + 1 + RECIPE_OVERSCAN
  );

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: p(4),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: p(5) }}>
        <span style={{ fontSize: p(11), fontWeight: "bold" }}>Recettes</span>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            backToTop();
          }}
          placeholder="Rechercher ..."
          style={{
            flex: 1,
            minWidth: 0,
            height: p(17),
            boxSizing: "border-box",
            border: "none",
            borderRadius: p(4),
            padding: `0 ${p(6)}px`,
            background: "#ffffff",
            fontFamily: "inherit",
            fontSize: p(9),
            color: C.text,
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: p(3) }}>
        <span style={{ fontSize: p(8), color: C.muted }}>Cases</span>
        {SLOT_FILTERS.map((count) => (
          <SlotFilterBox
            key={count}
            zoom={zoom}
            count={count}
            checked={slotFilter.has(count)}
            tone={craftRecipeTone(count, maxSlots)}
            onToggle={() => {
              const next = new Set(slotFilter);
              if (!next.delete(count)) {
                next.add(count);
              }
              setSlotFilter(next);
              backToTop();
            }}
          />
        ))}
        <span
          style={{
            marginLeft: "auto",
            fontSize: p(8),
            color: C.muted,
            whiteSpace: "nowrap",
          }}
        >
          {visible.length}
        </span>
      </div>

      <div
        ref={attachList}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onWheel={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          background: C.rowEven,
          border: `${p(1)}px solid rgba(0, 0, 0, 0.3)`,
          borderRadius: p(4),
        }}
      >
        {visible.length === 0 ? (
          <div style={{ padding: p(10), fontSize: p(9), color: C.muted }}>
            {craftsLang === null
              ? "Chargement des recettes..."
              : all.length === 0
                ? "Ce métier ne fabrique rien."
                : "Aucune recette ne correspond."}
          </div>
        ) : (
          // Only the rows in view are mounted: a Bricoleur's two skills
          // carry ~250 recipes and up to eight ingredient icons each, and
          // mounting all of them at once is what made the window stutter
          // on open. The spacers keep the scrollbar honest.
          <div style={{ height: p(total), position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: p(offsets[first] ?? 0),
                left: 0,
                right: 0,
              }}
            >
              {visible.slice(first, last).map((entry, index) => (
                <RecipeRow
                  key={entry.recipe.resultItemId}
                  zoom={zoom}
                  entry={entry}
                  lang={craftsLang}
                  maxSlots={maxSlots}
                  odd={(first + index) % 2 === 1}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The index of the row containing `offset`, by binary search. */
function firstRowAt(offsets: readonly number[], offset: number): number {
  let low = 0;
  let high = offsets.length - 1;

  while (low < high) {
    const mid = (low + high + 1) >> 1;

    if ((offsets[mid] ?? 0) <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

/**
 * Every recipe the selected job's craft skills know, dearest first.
 *
 * `SK[skillId].cl` is the skill's own result list and it is unordered — 88
 * entries for "Sculpter un Bâton", in no particular sequence. Retail sorts
 * the book by the result's level, highest first, which is also the ordering
 * that puts what a high-level artisan actually makes at the top. Ids with
 * no `CR` entry are dropped: the skill claims them, the bundle has no
 * recipe for them, and a row with no ingredients says nothing.
 */
function jobRecipes(
  job: PlayerJob | null,
  jobsLang: JobsLang | null,
  craftsLang: CraftsLang | null
): JobRecipe[] {
  if (!job || !jobsLang || !craftsLang) {
    return [];
  }

  const out: JobRecipe[] = [];
  const seen = new Set<number>();

  for (const skill of job.skills) {
    if (skill.slots <= 0) {
      continue;
    }

    const text = jobsLang.skills.get(skill.id);

    if (!text) {
      continue;
    }

    for (const id of text.craftItemIds) {
      const recipe = craftsLang.recipes.get(id);

      if (!recipe || seen.has(id)) {
        continue;
      }

      seen.add(id);
      out.push({ recipe, skillLabel: text.label, slots: skill.slots });
    }
  }

  return out.sort(
    (a, b) =>
      b.recipe.resultLevel - a.recipe.resultLevel ||
      a.recipe.resultName.localeCompare(b.recipe.resultName, "fr")
  );
}

/**
 * 1.29 tints a recipe by what it pays: grey for one too small for the bench
 * to grant experience, green for one that still does, red for one that fills
 * the bench and pays the normal rate. `craftRecipeTone` owns the thresholds;
 * this is only the palette, shared with the workbench's own book.
 */
function toneColor(tone: ReturnType<typeof craftRecipeTone>): string {
  if (tone === "grey") {
    return "#858585";
  }
  if (tone === "green") {
    return "#5f7f2e";
  }
  if (tone === "red") {
    return "#a8412c";
  }
  return C.text;
}

function SlotFilterBox({
  zoom,
  count,
  checked,
  tone,
  onToggle,
}: {
  zoom: number;
  count: number;
  checked: boolean;
  tone: ReturnType<typeof craftRecipeTone>;
  onToggle: () => void;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const color = toneColor(tone);

  return (
    <button
      type="button"
      title={`${count} ingrédients`}
      aria-pressed={checked}
      onClick={onToggle}
      style={{
        width: p(13),
        height: p(13),
        padding: 0,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: p(2),
        border: `${p(1)}px solid rgba(0, 0, 0, 0.45)`,
        background: checked ? color : "#ffffff",
        color: checked ? "#ffffff" : color,
        fontFamily: "inherit",
        fontSize: p(8),
        fontWeight: "bold",
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      {count}
    </button>
  );
}

/**
 * One result, the skill that makes it, and its ingredients laid out in the
 * bench's own cells — filled from the left, the empty ones left showing, so
 * a glance says how much of the bench the recipe uses.
 */
function RecipeRow({
  zoom,
  entry,
  lang,
  maxSlots,
  odd,
}: {
  zoom: number;
  entry: JobRecipe;
  lang: CraftsLang | null;
  maxSlots: number;
  odd: boolean;
}) {
  const p = (n: number) => Math.round(n * zoom);
  const { recipe } = entry;
  const result = lang?.items.get(recipe.resultItemId);
  const tone = craftRecipeTone(recipe.ingredients.length, maxSlots);

  return (
    <div
      style={{
        height: p(recipeRowHeight(recipe.ingredients.length)),
        boxSizing: "border-box",
        display: "flex",
        alignItems: "flex-start",
        gap: p(6),
        padding: `${p(4)}px ${p(6)}px`,
        background: odd ? C.rowOdd : C.rowEven,
      }}
    >
      <span style={{ width: p(30), height: p(30), flexShrink: 0 }}>
        {result && (
          <ItemIcon
            typeId={result.typeId}
            gfxId={result.gfxId}
            size="100%"
            alt={result.name}
          />
        )}
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: p(6),
            fontSize: p(10),
            fontWeight: "bold",
            color: toneColor(tone),
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {recipe.resultName}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontWeight: "normal",
              fontSize: p(8),
              color: C.muted,
            }}
          >
            Niv. {recipe.resultLevel}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontWeight: "normal",
              fontSize: p(8),
              color: C.muted,
            }}
          >
            ({entry.skillLabel}) · {recipe.ingredients.length}/{entry.slots}{" "}
            cases
          </span>
        </span>

        <span
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${RECIPE_CHIP_COLUMNS}, minmax(0, 1fr))`,
            columnGap: p(8),
            marginTop: p(3),
          }}
        >
          {recipe.ingredients.map((ingredient) => {
            const info = lang?.items.get(ingredient.itemId);

            return (
              <span
                key={ingredient.itemId}
                style={{
                  height: p(RECIPE_CHIP_H),
                  display: "flex",
                  alignItems: "center",
                  gap: p(4),
                  minWidth: 0,
                  fontSize: p(9),
                  color: C.text,
                }}
              >
                <span
                  style={{
                    position: "relative",
                    width: p(14),
                    height: p(14),
                    flexShrink: 0,
                    boxSizing: "border-box",
                    borderRadius: p(2),
                    background: "rgba(0, 0, 0, 0.12)",
                    border: `${p(1)}px solid rgba(0, 0, 0, 0.25)`,
                  }}
                >
                  {info && (
                    <ItemIcon
                      typeId={info.typeId}
                      gfxId={info.gfxId}
                      size="100%"
                      alt=""
                    />
                  )}
                </span>
                <span style={{ flexShrink: 0, fontWeight: "bold" }}>
                  {ingredient.quantity}×
                </span>
                <span
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {info?.name ?? `Objet ${ingredient.itemId}`}
                </span>
              </span>
            );
          })}
        </span>
      </span>
    </div>
  );
}
