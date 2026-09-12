import { useEffect, useRef } from "react";

import { getFighterPortraitRenderer } from "@/game/render/fighter-portrait-renderer";

interface BannerFightPortraitProps {
  gfxId: number;
  name: string;
  colors: readonly [number, number, number];
  countdown?: number;
}

/** Crop the existing fighter artwork to a bust inside the dial's 74px viewport. */
export function BannerFightPortrait({
  gfxId,
  name,
  colors: [c1, c2, c3],
  countdown,
}: BannerFightPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    void getFighterPortraitRenderer()
      .getCanvas(gfxId, 256, [c1, c2, c3])
      .then((source) => {
        if (cancelled || !source) {
          return;
        }
        // The renderer caches canvases. Copy pixels so the dial cannot steal
        // artwork from an open character panel or another portrait host.
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.getContext("2d")?.drawImage(source, 0, 0);
      });
    return () => {
      cancelled = true;
    };
  }, [gfxId, c1, c2, c3]);

  return (
    <div className="absolute inset-[calc(22.5px*var(--resolution-factor))] overflow-hidden rounded-full bg-[#1a1610]">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Portrait de la classe de ${name}`}
        aria-hidden={countdown !== undefined}
        className="block h-full w-full origin-[50%_20%] scale-200 object-cover object-top"
        style={{ imageRendering: "auto" }}
      />
      {countdown !== undefined && (
        <div
          role="timer"
          aria-label="Fin de votre tour dans"
          className="absolute inset-0 flex items-center justify-center bg-[#1a1610] font-[DofusVerdana,sans-serif] text-[calc(40px*var(--resolution-factor))] font-bold leading-none text-white tabular-nums"
        >
          {countdown}
        </div>
      )}
    </div>
  );
}
