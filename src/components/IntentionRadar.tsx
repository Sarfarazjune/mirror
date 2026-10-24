"use client";

interface RadarItem {
  name: string;
  intended: number; // 0 to 1
  actual: number;   // 0 to 1
  colour: string;
}

interface IntentionRadarProps {
  items: RadarItem[];
  score: number;
}

export default function IntentionRadar({ items, score }: IntentionRadarProps) {
  const size = 320;
  const center = size / 2;
  const radius = 110;
  const count = Math.max(items.length, 3);

  // Calculate coordinates for polygon vertices
  const getCoordinates = (index: number, valueRatio: number) => {
    const angle = (Math.PI * 2 / count) * index - Math.PI / 2;
    const r = radius * Math.min(Math.max(valueRatio, 0.05), 1.1);
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Label coordinates slightly outside the outer ring
  const getLabelCoordinates = (index: number) => {
    const angle = (Math.PI * 2 / count) * index - Math.PI / 2;
    const r = radius + 32;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // Find max share for scaling normalization
  const maxShare = Math.max(
    ...items.map((i) => Math.max(i.intended, i.actual)),
    0.3
  );

  // Generate SVG polygon points
  const intendedPoints = items
    .map((item, i) => {
      const { x, y } = getCoordinates(i, item.intended / maxShare);
      return `${x},${y}`;
    })
    .join(" ");

  const actualPoints = items
    .map((item, i) => {
      const { x, y } = getCoordinates(i, item.actual / maxShare);
      return `${x},${y}`;
    })
    .join(" ");

  // Clarity blur based on Mirror score
  const blurAmount = score >= 80 ? 0 : score >= 60 ? 2 : score >= 40 ? 5 : 8;

  return (
    <div className="relative flex w-full flex-col items-center justify-center p-2 sm:p-4">
      {/* Dynamic Frosted Background Glow */}
      <div
        className="pointer-events-none absolute h-64 w-64 rounded-full bg-gradient-to-tr from-violet-600/20 via-cyan-500/15 to-transparent blur-[60px] transition-all duration-700"
        style={{
          filter: `blur(${blurAmount * 4 + 40}px)`,
          opacity: score / 100 * 0.4 + 0.2,
        }}
      />

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full max-w-[320px] select-none overflow-visible"
      >
        <defs>
          <radialGradient id="radar-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#040714" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="actual-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Concentric Guide Circles */}
        {[0.25, 0.5, 0.75, 1].map((level, idx) => (
          <circle
            key={idx}
            cx={center}
            cy={center}
            r={radius * level}
            fill="none"
            stroke="rgba(148, 163, 184, 0.14)"
            strokeDasharray={level === 1 ? "none" : "3 3"}
            strokeWidth="1"
          />
        ))}

        {/* Axis rays */}
        {items.map((_, i) => {
          const { x, y } = getCoordinates(i, 1);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="rgba(148, 163, 184, 0.16)"
              strokeWidth="1"
            />
          );
        })}

        {/* Translucent Filled Shape: ACTUAL logged balance */}
        <polygon
          points={actualPoints}
          fill="url(#actual-grad)"
          stroke="#06b6d4"
          strokeWidth="2.5"
          style={{
            filter: "drop-shadow(0 0 10px rgba(34, 211, 238, 0.16))",
          }}
          className="transition-all duration-700 ease-out"
        />

        {/* Glowing Outline Shape: INTENDED priority balance */}
        <polygon
          points={intendedPoints}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2.5"
          strokeDasharray="5 3"
          className="transition-all duration-700 ease-out"
          style={{
            filter: "drop-shadow(0 0 6px rgba(167, 139, 250, 0.8))",
          }}
        />

        {/* Vertex dots */}
        {items.map((item, i) => {
          const actCoord = getCoordinates(i, item.actual / maxShare);
          const intCoord = getCoordinates(i, item.intended / maxShare);
          return (
            <g key={i}>
              <circle cx={intCoord.x} cy={intCoord.y} r="3.5" fill="#c4b5fd" />
              <circle cx={actCoord.x} cy={actCoord.y} r="3.5" fill="#22d3ee" />
            </g>
          );
        })}

        {/* Axis Labels */}
        {items.map((item, i) => {
          const { x, y } = getLabelCoordinates(i);
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[10px] font-semibold tracking-wide sm:text-[11px]"
              fill={item.colour}
              stroke="#040714"
              strokeWidth="4"
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {item.name}
            </text>
          );
        })}
      </svg>

      {/* Legend below radar */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-300 sm:mt-4 sm:gap-3 sm:text-xs">
        <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5">
          <span className="h-0.5 w-4 rounded-full bg-violet-300 shadow-[0_0_8px_rgba(196,181,253,0.65)]" />
          <span>Intended Balance</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5">
          <span className="h-0.5 w-4 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.55)]" />
          <span>Actual Logged</span>
        </div>
      </div>
    </div>
  );
}
