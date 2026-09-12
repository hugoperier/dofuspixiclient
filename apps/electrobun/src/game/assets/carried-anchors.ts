export interface CarriedAnchors {
  fps: number;
  animations: Record<string, ({ x: number; y: number } | null)[]>;
}

/** Published strips may have been resampled from 20 to 60 fps. */
export function carriedAnchorAt(
  data: CarriedAnchors | undefined,
  animation: string,
  frame: number,
  fps: number
) {
  const points = data?.animations[animation];
  if (!data || !points?.length || fps <= 0 || data.fps <= 0) {
    return null;
  }
  const index = Math.min(
    points.length - 1,
    Math.floor((frame * data.fps) / fps)
  );
  return points[index] ?? null;
}

export function carryingAnimation(base: string, carrying: boolean): string {
  return (carrying || base === "carringThrow") && !base.endsWith("_C")
    ? `${base}_C`
    : base;
}
