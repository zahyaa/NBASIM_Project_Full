// Sprint B3 — Gameplay attributes (clutch / iq / leadership).
//
// Each attribute is 0-99 and rolls around the player's overall rating
// with some RNG so two 80-OVR players still feel distinct.
//
// Sim integration (see services/simulation.js):
//   • clutch — in Q4 with margin <= 5, clutch >= 80 gets +5% shot chance,
//              clutch <= 50 gets -3%.
//   • iq     — small modifier on assist + turnover splits per possession.
//   • leadership — averaged across the active 5 to build a team chemistry
//              modifier (±2% shot chance) applied across the whole game.
//
// Backfill: ensureB3Fields(player) is idempotent and called on demand
// (e.g. from buildSimRoster) so legacy saves get reasonable values
// without forcing a migration.

function aroundRating(p, spread = 12, floor = 40, ceiling = 99) {
  const base = p.rating || 70;
  const v = base + Math.floor(Math.random() * (spread * 2 + 1)) - spread;
  return Math.max(floor, Math.min(ceiling, v));
}

function ensureB3Fields(p) {
  if (!p) return false;
  let modified = false;
  if (!p.clutch) {
    p.clutch = aroundRating(p, 18); // clutch varies most
    modified = true;
  }
  if (!p.iq) {
    p.iq = aroundRating(p, 10);
    modified = true;
  }
  if (!p.leadership) {
    // Leadership skews lower; only some players are vocal leaders.
    const base = (p.rating || 70) - 8;
    p.leadership = Math.max(35, Math.min(99, base + Math.floor(Math.random() * 25) - 8));
    modified = true;
  }
  return modified;
}

// Compute team-wide chemistry modifier from the active 5's leadership.
// Returns a multiplier centered on 1.0; ±2% range.
function teamChemistryMul(activeFive) {
  if (!activeFive || activeFive.length === 0) return 1.0;
  let sum = 0;
  for (const p of activeFive) {
    ensureB3Fields(p);
    sum += p.leadership || 65;
  }
  const avg = sum / activeFive.length;
  // 65 → 1.0, 85 → 1.02, 45 → 0.98 (clamped).
  const mul = 1 + ((avg - 65) / 1000);
  return Math.max(0.98, Math.min(1.02, mul));
}

// Per-shot clutch modifier. quartersLeft + scoreMargin determine if we
// are in "clutch time" (Q4, margin within 5). Returns multiplier on shot
// chance for the shooter.
function clutchMul(player, { quarter, marginAbs }) {
  if (quarter !== 4 || marginAbs > 5) return 1.0;
  ensureB3Fields(player);
  const c = player.clutch || 65;
  if (c >= 80) return 1.05;
  if (c <= 50) return 0.97;
  return 1.0;
}

// IQ modifier on the assist/turnover thresholds. Higher IQ shifts the
// outcome distribution toward assists and away from turnovers.
// Returns { assistDelta, turnoverDelta } both in raw probability points.
function iqDeltas(player) {
  ensureB3Fields(player);
  const iq = player.iq || 65;
  // 65 → 0/0, 90 → +0.025/-0.02, 45 → -0.015/+0.015 (clamped).
  const k = (iq - 65) / 1000;
  return {
    assistDelta: Math.max(-0.02, Math.min(0.025, k)),
    turnoverDelta: Math.max(-0.025, Math.min(0.02, -k)),
  };
}

module.exports = {
  ensureB3Fields,
  teamChemistryMul,
  clutchMul,
  iqDeltas,
};
