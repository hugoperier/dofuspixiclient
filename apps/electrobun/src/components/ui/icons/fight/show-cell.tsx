"use client";

export function ShowCell({ className }: { className?: string }) {
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
      <title>Show a cell</title>
      <g transform="translate(12 12)">
        {/* The isometric cell the arrow points at. */}
        <path
          fill="#8f8a72"
          stroke="#402b15"
          strokeWidth="0.8"
          d="M-8 7 L0 3 L8 7 L0 11 Z"
        />
        {/* The red marker arrow. */}
        <path
          fill="var(--color-dofus-hp-red, #c81414)"
          stroke="#5a0808"
          strokeWidth="0.8"
          strokeLinejoin="round"
          d="M-3.5 -10 L3.5 -10 L3.5 -1 L6.5 -1 L0 6 L-6.5 -1 L-3.5 -1 Z"
        />
      </g>
    </svg>
  );
}
