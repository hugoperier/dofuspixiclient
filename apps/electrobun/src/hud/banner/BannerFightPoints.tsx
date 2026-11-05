/** Original PointsViewerAP/MP backgrounds; positions are relative to UI_Banner.
 * Their registration points centre the number, not the asymmetric artwork. */
export function BannerFightPoints({ ap, mp }: { ap: number; mp: number }) {
  return (
    <>
      <div
        role="img"
        aria-label={`${ap} points d’action`}
        title={`Points d’action : ${ap}`}
        className="absolute z-20 left-[calc(359.25px*var(--resolution-factor))] top-[calc(2.25px*var(--resolution-factor))] w-[calc(31.5px*var(--resolution-factor))] h-[calc(33.75px*var(--resolution-factor))]"
      >
        <img
          src="/themes/classic/assets/fight/points/ap.svg"
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full"
        />
        <span className="pointer-events-none absolute left-[calc(2.5px*var(--resolution-factor))] top-[calc(4.75px*var(--resolution-factor))] flex h-[calc(29px*var(--resolution-factor))] w-[calc(29px*var(--resolution-factor))] items-center justify-center font-[impact,sans-serif] text-[calc(15px*var(--resolution-factor))] text-[#0000ff] tabular-nums">
          {ap}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${mp} points de mouvement`}
        title={`Points de mouvement : ${mp}`}
        className="absolute z-20 left-[calc(438.3px*var(--resolution-factor))] top-[calc(2.55px*var(--resolution-factor))] w-[calc(33.45px*var(--resolution-factor))] h-[calc(34.45px*var(--resolution-factor))]"
      >
        <img
          src="/themes/classic/assets/fight/points/mp.svg"
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full"
        />
        <span className="pointer-events-none absolute left-[calc(4.45px*var(--resolution-factor))] top-[calc(5.45px*var(--resolution-factor))] flex h-[calc(29px*var(--resolution-factor))] w-[calc(29px*var(--resolution-factor))] items-center justify-center font-[impact,sans-serif] text-[calc(15px*var(--resolution-factor))] text-[#006600] tabular-nums">
          {mp}
        </span>
      </div>
    </>
  );
}
