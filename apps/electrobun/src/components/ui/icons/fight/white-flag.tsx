"use client";

export function WhiteFlag({ className }: { className?: string }) {
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
      <title>Forfeit</title>
      {/* Surrender: the white flag 1.29 sits under the banner medallion. */}
      <g transform="translate(12 12)">
        <path
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinecap="round"
          d="M-5 -9 L-5 9"
        />
        <path
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth="0.8"
          strokeLinejoin="round"
          d="M-5 -9 L7 -6 L-5 -1 Z"
        />
      </g>
    </svg>
  );
}
