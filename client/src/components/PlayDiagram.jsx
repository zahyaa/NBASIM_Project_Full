// Sprint J — half-court SVG renderer for preset plays.
//
// Coordinate system (must match data/presetPlays.js):
//   viewBox 0 0 500 470, basket at TOP, baseline y=10, hoop (250,50),
//   free-throw line y=190, half-court y=460.
//
// Move types rendered with distinct visual styling:
//   cut     — solid arrow (player movement without the ball)
//   dribble — wavy/zigzag arrow (player driving with the ball)
//   pass    — dashed straight arrow (ball pass)
//   screen  — short capped bar at the screen location (T-shape)

import React from 'react';

const COLORS = {
  court: '#fde68a',
  line: '#92400e',
  hoop: '#ef4444',
  player: '#1e3a8a',
  playerStroke: '#fbbf24',
  playerText: '#fff',
  cut: '#0ea5e9',
  dribble: '#10b981',
  pass: '#f97316',
  screen: '#dc2626',
};

function arrowMarker(id, color) {
  return (
    <marker
      key={id}
      id={id}
      viewBox="0 0 10 10"
      refX="9" refY="5"
      markerWidth="6" markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
    </marker>
  );
}

function CourtBackground() {
  return (
    <g>
      {/* outer court */}
      <rect x="0" y="0" width="500" height="470" fill={COLORS.court} />
      <rect x="2" y="2" width="496" height="466"
            fill="none" stroke={COLORS.line} strokeWidth="2" />

      {/* baseline */}
      <line x1="2" y1="10" x2="498" y2="10" stroke={COLORS.line} strokeWidth="2" />

      {/* lane (paint) */}
      <rect x="200" y="10" width="100" height="180"
            fill="#fef3c7" stroke={COLORS.line} strokeWidth="2" />

      {/* free-throw circle */}
      <circle cx="250" cy="190" r="55"
              fill="none" stroke={COLORS.line} strokeWidth="2" />

      {/* restricted area */}
      <path d="M 220 50 A 30 30 0 0 0 280 50"
            fill="none" stroke={COLORS.line} strokeWidth="1.5" />

      {/* backboard */}
      <line x1="225" y1="40" x2="275" y2="40" stroke={COLORS.line} strokeWidth="3" />

      {/* hoop */}
      <circle cx="250" cy="50" r="8"
              fill="none" stroke={COLORS.hoop} strokeWidth="2.5" />

      {/* 3-pt arc + corner lines */}
      <line x1="35" y1="10" x2="35" y2="95" stroke={COLORS.line} strokeWidth="2" />
      <line x1="465" y1="10" x2="465" y2="95" stroke={COLORS.line} strokeWidth="2" />
      <path d="M 35 95 A 220 220 0 0 0 465 95"
            fill="none" stroke={COLORS.line} strokeWidth="2" />

      {/* half-court line */}
      <line x1="2" y1="460" x2="498" y2="460" stroke={COLORS.line} strokeWidth="2" />
      <circle cx="250" cy="460" r="40"
              fill="none" stroke={COLORS.line} strokeWidth="1.5" />
    </g>
  );
}

function Player({ x, y, label }) {
  return (
    <g>
      <circle cx={x} cy={y} r="14"
              fill={COLORS.player}
              stroke={COLORS.playerStroke} strokeWidth="2" />
      <text x={x} y={y + 5} textAnchor="middle"
            fontSize="14" fontWeight="700" fill={COLORS.playerText}
            fontFamily="system-ui, sans-serif">
        {label}
      </text>
    </g>
  );
}

function Move({ move, idx }) {
  const { type, from, to, label, dashed } = move;
  const [x1, y1] = from;
  const [x2, y2] = to;
  const color = COLORS[type] || '#000';
  const marker = `url(#arr-${type})`;

  // Screen — render a capped T at the destination.
  if (type === 'screen') {
    // perpendicular cap
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len, uy = dy / len;
    // cap perpendicular vector
    const px = -uy * 10, py = ux * 10;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={color} strokeWidth="2.5" strokeDasharray="2 3" />
        <line
          x1={x2 + px} y1={y2 + py}
          x2={x2 - px} y2={y2 - py}
          stroke={color} strokeWidth="4" strokeLinecap="round"
        />
      </g>
    );
  }

  // Dribble — wavy line via path with quadratic curves.
  if (type === 'dribble') {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const segs = Math.max(2, Math.floor(len / 18));
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux; // normal
    const amp = 6;
    let d = `M ${x1} ${y1}`;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const cx = x1 + dx * (t - 0.5 / segs) + nx * amp * (i % 2 ? 1 : -1);
      const cy = y1 + dy * (t - 0.5 / segs) + ny * amp * (i % 2 ? 1 : -1);
      const ex = x1 + dx * t;
      const ey = y1 + dy * t;
      d += ` Q ${cx} ${cy} ${ex} ${ey}`;
    }
    return (
      <g>
        <path d={d} fill="none" stroke={color} strokeWidth="2.5"
              markerEnd={marker} />
        {label && (
          <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 6}
                fontSize="10" fill={color} fontWeight="600">{label}</text>
        )}
      </g>
    );
  }

  // pass — dashed; cut — solid.
  const strokeDash = type === 'pass' || dashed ? '6 4' : undefined;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={color} strokeWidth="2.5"
            strokeDasharray={strokeDash}
            markerEnd={marker} />
      {label && (
        <text x={(x1 + x2) / 2 + 6} y={(y1 + y2) / 2 - 6}
              fontSize="10" fill={color} fontWeight="600"
              style={{ paintOrder: 'stroke', stroke: '#fffbeb', strokeWidth: 3 }}>
          {label}
        </text>
      )}
    </g>
  );
}

function Legend() {
  return (
    <g fontSize="10" fontFamily="system-ui, sans-serif" fontWeight="600">
      <rect x="6" y="430" width="170" height="34" fill="#fffbeb"
            stroke={COLORS.line} strokeWidth="1" rx="3" />
      <line x1="14" y1="442" x2="34" y2="442" stroke={COLORS.cut} strokeWidth="2.5" />
      <text x="38" y="445" fill="#0c4a6e">cut</text>

      <line x1="64" y1="442" x2="84" y2="442" stroke={COLORS.pass}
            strokeWidth="2.5" strokeDasharray="4 3" />
      <text x="88" y="445" fill="#7c2d12">pass</text>

      <path d="M 14 458 q 5 -6 10 0 t 10 0" fill="none"
            stroke={COLORS.dribble} strokeWidth="2.5" />
      <text x="38" y="461" fill="#064e3b">dribble</text>

      <line x1="76" y1="458" x2="86" y2="458" stroke={COLORS.screen}
            strokeWidth="4" strokeLinecap="round" />
      <text x="92" y="461" fill="#7f1d1d">screen</text>
    </g>
  );
}

export default function PlayDiagram({ diagram, width = 280, height }) {
  if (!diagram) return null;
  const ratio = 470 / 500;
  const h = height || Math.round(width * ratio);
  return (
    <svg viewBox="0 0 500 470" width={width} height={h}
         style={{ display: 'block', borderRadius: 6 }}
         data-testid="play-diagram">
      <defs>
        {arrowMarker('arr-cut',     COLORS.cut)}
        {arrowMarker('arr-dribble', COLORS.dribble)}
        {arrowMarker('arr-pass',    COLORS.pass)}
        {arrowMarker('arr-screen',  COLORS.screen)}
      </defs>
      <CourtBackground />
      {(diagram.moves || []).map((m, i) => <Move key={i} move={m} idx={i} />)}
      {(diagram.players || []).map(p => (
        <Player key={p.id} x={p.x} y={p.y} label={p.label} />
      ))}
      <Legend />
    </svg>
  );
}
