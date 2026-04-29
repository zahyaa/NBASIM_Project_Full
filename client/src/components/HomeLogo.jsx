// HomeLogo — circular basketball SVG that navigates to the main menu.
// Used as a fixed top-right "home" button visible on every authenticated page.
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function HomeLogo({ size = 56, fixed = true }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Don't show on the menu itself or on auth screens.
  if (pathname === '/menu' || pathname === '/' || pathname === '/login' || pathname === '/register') {
    return null;
  }

  const wrap = fixed
    ? { position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }
    : { display: 'inline-block' };

  return (
    <button
      onClick={() => navigate('/menu')}
      title="Home"
      aria-label="Go to main menu"
      style={{
        ...wrap,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08) rotate(-8deg)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1) rotate(0deg)'; }}
    >
      <BasketballSVG size={size} />
    </button>
  );
}

// Pure SVG basketball — orange ball with classic black seam lines.
export function BasketballSVG({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ballFill" cx="35%" cy="30%" r="75%">
          <stop offset="0%"  stopColor="#fdba74" />
          <stop offset="55%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#9a3412" />
        </radialGradient>
      </defs>

      {/* Ball body */}
      <circle cx="50" cy="50" r="46" fill="url(#ballFill)" stroke="#1a0c06" strokeWidth="2" />

      {/* Vertical seam */}
      <path d="M 50 4 Q 50 50 50 96" fill="none" stroke="#1a0c06" strokeWidth="2.2" strokeLinecap="round" />

      {/* Horizontal seam (slight curve for 3D feel) */}
      <path d="M 4 50 Q 50 56 96 50" fill="none" stroke="#1a0c06" strokeWidth="2.2" strokeLinecap="round" />

      {/* Left curved seam */}
      <path d="M 18 14 Q 30 50 18 86" fill="none" stroke="#1a0c06" strokeWidth="2.2" strokeLinecap="round" />

      {/* Right curved seam */}
      <path d="M 82 14 Q 70 50 82 86" fill="none" stroke="#1a0c06" strokeWidth="2.2" strokeLinecap="round" />

      {/* Highlight */}
      <ellipse cx="36" cy="32" rx="10" ry="6" fill="rgba(255,255,255,0.28)" />
    </svg>
  );
}
