"use client";

export function NeedHelp({ className }: { className?: string }) {
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
      <title>Ask for help</title>
      {/* Three stick figures — the taller one in front, as in 1.29. */}
      <g transform="translate(12 12)" fill="#e8d8a8" stroke="none">
        {[
          { x: -6.5, s: 0.8 },
          { x: 0, s: 1 },
          { x: 6.5, s: 0.8 },
        ].map(({ x, s }) => (
          <g key={x} transform={`translate(${x} 0) scale(${s})`}>
            <circle cy="-5.5" r="3" />
            <path
              fill="none"
              stroke="#e8d8a8"
              strokeWidth="1.4"
              strokeLinecap="round"
              d="M0 -2.2 L0 3 M-3 0 L0 -1 L3 0 M-2.6 8 L0 3 L2.6 8"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}
