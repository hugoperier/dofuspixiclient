"use client";

/**
 * The eye 1.29 crosses out when the leader forbids spectators; `blocked`
 * draws the red slash over it.
 */
export function Spectators({
  className,
  blocked = false,
}: {
  className?: string;
  blocked?: boolean;
}) {
  return (
    <svg
      overflow="visible"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      width="24px"
      height="24px"
      className={className}
      shapeRendering="geometricPrecision"
    >
      <title>{blocked ? "Spectators blocked" : "Spectators allowed"}</title>
      <g transform="translate(12 12)">
        <path
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinejoin="round"
          d="M-9 0 Q-4.5 -6 0 -6 Q4.5 -6 9 0 Q4.5 6 0 6 Q-4.5 6 -9 0 Z"
        />
        <circle r="2.4" fill="#ffffff" />
        {blocked && (
          <path
            stroke="var(--color-dofus-hp-red, #c81414)"
            strokeWidth="2"
            strokeLinecap="round"
            d="M-8 8 L8 -8"
          />
        )}
      </g>
    </svg>
  );
}
