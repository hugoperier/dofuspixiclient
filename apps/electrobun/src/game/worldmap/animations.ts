import type { Sprite } from "pixi.js";

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function animateSprite(
  sprite: Sprite,
  targetX: number,
  targetY: number,
  duration: number,
  targetRotation = 0,
  onComplete?: () => void
): void {
  const startX = sprite.x;
  const startY = sprite.y;
  const startRotation = sprite.rotation;
  const targetRotationRad = (targetRotation * Math.PI) / 180;
  const startTime = performance.now();

  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(progress);

    sprite.x = startX + (targetX - startX) * eased;
    sprite.y = startY + (targetY - startY) * eased;
    sprite.rotation =
      startRotation + (targetRotationRad - startRotation) * eased;

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      onComplete?.();
    }
  };

  requestAnimationFrame(animate);
}
