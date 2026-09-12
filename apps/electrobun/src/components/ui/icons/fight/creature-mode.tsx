"use client";

export function CreatureMode({ className }: { className?: string }) {
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
      <title>Creature mode</title>
      {/* The simplified white head 1.29 swaps every fighter for. */}
      <g transform="translate(12 12)">
        <path
          fill="#ffffff"
          stroke="#402b15"
          strokeWidth="1"
          d="M-7 -3 Q-7 -9 0 -9 Q7 -9 7 -3 Q7 3 3 6 L3 8 Q0 9.5 -3 8 L-3 6 Q-7 3 -7 -3 Z"
        />
        <circle cx="-3" cy="-3" r="1.6" fill="#1a1610" />
        <circle cx="3" cy="-3" r="1.6" fill="#1a1610" />
        <path
          fill="none"
          stroke="#1a1610"
          strokeWidth="1.2"
          strokeLinecap="round"
          d="M-2.5 2.5 Q0 4.5 2.5 2.5"
        />
      </g>
    </svg>
  );
}
