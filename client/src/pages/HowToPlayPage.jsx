// HowToPlayPage — comprehensive in-app guide covering every mode, the
// fantasy economy, team management, playoffs, multiplayer, and tips.
// Fully scrollable single-column layout with anchor sections.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SECTIONS = [
  { id: 'getting-started', title: '🚀 Getting Started', icon: '🚀' },
  { id: 'fantasy-draft',   title: '🏆 Fantasy Draft',   icon: '🏆' },
  { id: 'season',          title: '📊 Season & Standings', icon: '📊' },
  { id: 'team-management', title: '📋 Team Management', icon: '📋' },
  { id: 'playbook',        title: '📝 Playbook',        icon: '📝' },
  { id: 'store',           title: '🛍️ Store & Tokens',  icon: '🛍️' },
  { id: 'playoffs',        title: '🎯 Playoffs',         icon: '🎯' },
  { id: 'one-on-one',      title: '🥊 One on One',      icon: '🥊' },
  { id: 'blacktop',        title: '🔥 Blacktop',         icon: '🔥' },
  { id: 'bio',             title: '📖 Players Bio',      icon: '📖' },
  { id: 'multiplayer',     title: '🌐 Multiplayer',      icon: '🌐' },
  { id: 'subscriptions',   title: '⭐ Subscriptions',    icon: '⭐' },
  { id: 'difficulty',      title: '⚙️ Difficulty',       icon: '⚙️' },
  { id: 'tips',            title: '💡 Pro Tips',          icon: '💡' },
];

export default function HowToPlayPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState('getting-started');

  const scrollTo = (id) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={s.container}>
      <div style={s.inner}>
        <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
        <h1 style={s.title}>📚 How to Play</h1>
        <p style={s.subtitle}>
          The complete guide to NBASIM — from drafting your first team to lifting the championship trophy.
        </p>

        <div style={s.layout}>
          {/* Sidebar nav */}
          <nav style={s.sidebar}>
            <div style={s.sidebarTitle}>Sections</div>
            {SECTIONS.map(sec => (
              <button
                key={sec.id}
                onClick={() => scrollTo(sec.id)}
                style={{
                  ...s.sideLink,
                  ...(active === sec.id ? s.sideLinkActive : {}),
                }}
              >
                {sec.title}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div style={s.content}>
            <Section id="getting-started" title="🚀 Getting Started">
              <p>Welcome to NBASIM, a full basketball management sim where you draft real and historical NBA players, coach your roster, run an 82-game regular season, and chase the ring.</p>
              <h3 style={s.h3}>Your first 60 seconds</h3>
              <ol style={s.ol}>
                <li><strong>Sign up & log in</strong> — your progress, roster, tokens, and stats persist across sessions.</li>
                <li><strong>Open Fantasy Draft</strong> from the main menu — you'll pick a city, coach, conference, division, and draft 15 players.</li>
                <li><strong>Start the season</strong> from <em>Standings & Career</em> — your team plays a 30-CPU-team, 82-game schedule.</li>
                <li><strong>Compete</strong> in playoffs, the All-Star game, and chase achievements + tokens for the store.</li>
              </ol>
              <Tip>The 🏀 basketball logo at the bottom-right takes you back to the main menu from anywhere.</Tip>
            </Section>

            <Section id="fantasy-draft" title="🏆 Fantasy Draft">
              <p>The Fantasy Draft is the heart of NBASIM — every other mode flows from here.</p>
              <h3 style={s.h3}>Setup</h3>
              <ul style={s.ul}>
                <li><strong>City & Market Tier</strong> — Tier I cities (NYC, LA, Chicago) generate more revenue but cost more in salaries.</li>
                <li><strong>Conference & Division</strong> — Determines your schedule. Divisional opponents are played most often.</li>
                <li><strong>Coach</strong> — Each coach has a play-style. The user's coach defaults to a 7/10 rating; CPU teams roll 7–10.</li>
              </ul>
              <h3 style={s.h3}>Draft Flow</h3>
              <ol style={s.ol}>
                <li>You draft <strong>15 players</strong> across multiple rounds.</li>
                <li>The CPU drafts in parallel — picks happen live in the ticker.</li>
                <li>Each player has a heuristic <strong>rating</strong> (1–99) based on era, draft position, and experience.</li>
                <li>Pick balanced — guards for ball-handling, wings for scoring, bigs for the paint.</li>
              </ol>
              <Tip>You only get one bonus of 500 tokens for completing your first draft. Spend them wisely in the Store.</Tip>
            </Section>

            <Section id="season" title="📊 Season & Standings">
              <p>The season runs an authentic NBA-style 82-game schedule. Every CPU team plays exactly 82 games — standings are always full and ranked correctly.</p>
              <h3 style={s.h3}>Game-by-game vs Sim Rest</h3>
              <ul style={s.ul}>
                <li><strong>Play Next</strong> — Full 4-quarter simulation with play-by-play, shot chart, win probability, and box scores.</li>
                <li><strong>Sim Rest</strong> — Quick-sim every remaining game in seconds.</li>
              </ul>
              <h3 style={s.h3}>Standings View</h3>
              <ul style={s.ul}>
                <li>Toggle between <strong>League</strong>, <strong>Conference</strong>, and <strong>Division</strong>.</li>
                <li><span style={{ color: '#22c55e', fontWeight: 700 }}>Green PO badge</span> = clinched seed #1–#8 in your conference.</li>
                <li><span style={{ color: '#94a3b8', fontWeight: 700 }}>Grey OUT badge</span> = eliminated, ranked 9th or worse.</li>
                <li>A red dashed cut-line separates playoff teams from lottery teams.</li>
              </ul>
            </Section>

            <Section id="team-management" title="📋 Team Management">
              <p>Manage your roster mid-season — sign free agents, trade with CPU teams, set your lineup, and track contracts.</p>
              <h3 style={s.h3}>Tabs</h3>
              <ul style={s.ul}>
                <li><strong>Roster</strong> — Toggle <em>STARTER</em> on up to 5 players. Saved lineups apply for the rest of the season (full sims AND quick sims).</li>
                <li><strong>Free Agents</strong> — Sign undrafted players to fill gaps.</li>
                <li><strong>Trade</strong> — Propose 1-for-1 trades with any CPU team. Trade is rejected if it makes the CPU team weaker.</li>
                <li><strong>Injuries / Contracts</strong> — Track who's hurt and when contracts expire.</li>
                <li><strong>Playbook</strong> — Auto-generated plays + your custom plays from the Playbook page.</li>
              </ul>
              <Tip>Starters get 70% of the rating weight in quick-sim. Set your best 5 in the lineup to climb the standings.</Tip>
            </Section>

            <Section id="playbook" title="📝 Playbook">
              <p>Design custom plays that surface in your Team Management → Playbook tab.</p>
              <h3 style={s.h3}>Play Anatomy</h3>
              <ul style={s.ul}>
                <li><strong>Type</strong> — Set, ATO, Iso, PnR, Inbound, or Transition.</li>
                <li><strong>Formation</strong> — 1-4 High, 1-4 Low, Horns, Box, 5-Out, or Stack.</li>
                <li><strong>Roles</strong> — Pick a primary scorer, secondary, and a screener from your roster.</li>
                <li><strong>Description</strong> — Free-text notes (e.g. "PG comes off the high screen, kicks to the corner shooter").</li>
              </ul>
              <p>Up to 25 custom plays per user. Each is editable and deletable.</p>
            </Section>

            <Section id="store" title="🛍️ Store & Tokens">
              <p>Tokens are the in-game currency. Earn them through achievements, win streaks, and weekly subscriber bonuses.</p>
              <h3 style={s.h3}>What you can buy</h3>
              <ul style={s.ul}>
                <li><strong>Training Packs</strong> — Permanent +1/+2/+3 rating boosts on a roster player.</li>
                <li><strong>Signature Gear</strong> — Cosmetic flair tied to a player.</li>
                <li><strong>Recovery</strong> — Heal an injured player instantly.</li>
                <li><strong>Token Bundles</strong> — Buy more tokens via PayPal or credit card (last-4 only stored).</li>
              </ul>
            </Section>

            <Section id="playoffs" title="🎯 Playoffs">
              <p>After 82 games, the top 8 in each conference advance. The bracket is a faithful NBA layout: First Round → Conference Semis → Conference Finals → NBA Finals (centered).</p>
              <ul style={s.ul}>
                <li>Every series is <strong>best-of-7</strong>.</li>
                <li>Click <strong>Watch</strong> on a user series to replay every game with full play-by-play.</li>
                <li>Missed the playoffs? A red banner lets you skip straight to next season.</li>
              </ul>
            </Section>

            <Section id="one-on-one" title="🥊 One on One">
              <p>Pick any two NBA players (current or historical) and play a 1v1 to 11, 15, or 21. Includes popular matchups (MJ vs LeBron, Kobe vs AI), random mode, and instant rematch.</p>
            </Section>

            <Section id="blacktop" title="🔥 Blacktop">
              <p>Streetball mode. Build two teams of 1–5 active NBA players and run half-court to a target score.</p>
              <ul style={s.ul}>
                <li>Choose <strong>Simulate</strong> for instant box-score, or <strong>Watch</strong> for animated play-by-play.</li>
                <li>Solo players never pass to themselves — the engine routes the ball naturally even with one player.</li>
              </ul>
            </Section>

            <Section id="bio" title="📖 Players Bio">
              <p>Live NBA data — search any active player and get a full ESPN-style profile.</p>
              <ul style={s.ul}>
                <li>Real headshots cached for 24h.</li>
                <li>Current-season averages, advanced stats (TS%, eFG%, AST/TO).</li>
                <li>5-year career history + last 10 game logs.</li>
                <li><strong>Star</strong> any player to favorite them — pinned at the top of search results across sessions.</li>
                <li><strong>Compare mode</strong> — put two players side-by-side; better stat highlighted in green.</li>
              </ul>
            </Section>

            <Section id="multiplayer" title="🌐 Multiplayer">
              <p>Head-to-head against real users. Locked until you've completed your fantasy draft AND have an active premium subscription.</p>
              <h3 style={s.h3}>Modes</h3>
              <ul style={s.ul}>
                <li><strong>Public Match</strong> — Auto-pair with another online subscriber. First to 4 wins claims the series (best-of-7).</li>
                <li><strong>Private Match</strong> — Generate a 6-character code and share it with a friend, or join with theirs.</li>
                <li><strong>Playoff Mode</strong> — 8-user bracket. Random seeding, NBA-style Quarterfinals → Semifinals → Finals. Every series best-of-7. Last GM standing is crowned champion. <em>Play for the Ring.</em></li>
              </ul>
              <Tip>The lobby auto-polls every 3 seconds, so opponents see joins and game results in near-real-time without a refresh.</Tip>
            </Section>

            <Section id="subscriptions" title="⭐ Subscriptions">
              <p>Three tiers: <strong>Free</strong> (default), <strong>Premium</strong>, and <strong>GM Elite</strong>.</p>
              <ul style={s.ul}>
                <li>Premium unlocks Multiplayer + weekly token bonuses.</li>
                <li>GM Elite adds exclusive store items and the highest weekly bonus.</li>
                <li>Pay via PayPal or credit card. Only the last 4 digits of any card are ever stored.</li>
              </ul>
            </Section>

            <Section id="difficulty" title="⚙️ Difficulty">
              <p>Set in <strong>Settings</strong>. Applies to every CPU you face — full play-by-play, season sims, and playoff series. Multiplayer (user vs user) is unaffected.</p>
              <table style={s.table}>
                <thead>
                  <tr><th style={s.th}>Tier</th><th style={s.th}>CPU shot multiplier</th><th style={s.th}>CPU score Δ</th></tr>
                </thead>
                <tbody>
                  <tr><td style={s.td}><span style={{ color: '#22c55e', fontWeight: 700 }}>Easy</span></td><td style={s.td}>0.85×</td><td style={s.td}>−7</td></tr>
                  <tr><td style={s.td}><span style={{ color: '#3b82f6', fontWeight: 700 }}>Pro</span></td><td style={s.td}>1.00×</td><td style={s.td}>0</td></tr>
                  <tr><td style={s.td}><span style={{ color: '#f97316', fontWeight: 700 }}>Hard</span></td><td style={s.td}>1.08×</td><td style={s.td}>+6</td></tr>
                  <tr><td style={s.td}><span style={{ color: '#a855f7', fontWeight: 700 }}>All-Star</span></td><td style={s.td}>1.15×</td><td style={s.td}>+11</td></tr>
                  <tr><td style={s.td}><span style={{ color: '#ef4444', fontWeight: 700 }}>Legacy</span></td><td style={s.td}>1.22×</td><td style={s.td}>+16</td></tr>
                </tbody>
              </table>
            </Section>

            <Section id="tips" title="💡 Pro Tips">
              <ul style={s.ul}>
                <li>Always set your <strong>starting 5</strong> after every trade or signing — quick-sim weights starters at 70%.</li>
                <li>An elite coach (rating 9–10) can bridge a small roster gap. Watch which CPU teams have legacy coaches.</li>
                <li>Don't sleep on the <strong>Store</strong>. A few +2 training packs on your top 3 scorers can move you up an entire seed line.</li>
                <li>Save tokens early — playoff signings and recovery items get expensive when injuries hit late in the season.</li>
                <li>Multiplayer is locked behind subscription, but it's the only mode where pure skill (not difficulty) decides the result.</li>
              </ul>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} style={s.section}>
      <h2 style={s.h2}>{title}</h2>
      {children}
    </section>
  );
}

function Tip({ children }) {
  return (
    <div style={s.tip}>
      <span style={s.tipIcon}>💡</span>
      <span>{children}</span>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', color: '#e2e8f0', padding: 24 },
  inner: { maxWidth: 1100, margin: '0 auto' },
  backBtn: { background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, marginBottom: 16 },
  title: { color: '#facc15', fontSize: 36, margin: '0 0 6px', fontWeight: 900 },
  subtitle: { color: '#94a3b8', fontSize: 15, margin: '0 0 28px' },

  layout: { display: 'flex', gap: 24, alignItems: 'flex-start' },
  sidebar: {
    flex: '0 0 240px', position: 'sticky', top: 16,
    background: '#1e293b', borderRadius: 12, padding: 14,
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
  },
  sidebarTitle: { color: '#94a3b8', fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', padding: '4px 8px 8px' },
  sideLink: {
    display: 'block', width: '100%', textAlign: 'left',
    background: 'transparent', border: 'none', color: '#cbd5e1',
    padding: '8px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', marginBottom: 2,
  },
  sideLinkActive: { background: 'rgba(96,165,250,0.15)', color: '#60a5fa' },

  content: { flex: 1, minWidth: 0 },
  section: { background: '#1e293b', borderRadius: 14, padding: 28, marginBottom: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)' },
  h2: { color: '#60a5fa', fontSize: 24, margin: '0 0 12px', fontWeight: 800 },
  h3: { color: '#facc15', fontSize: 16, margin: '18px 0 8px', fontWeight: 700 },
  ul: { color: '#cbd5e1', fontSize: 14, lineHeight: 1.7, paddingLeft: 22, margin: '0 0 8px' },
  ol: { color: '#cbd5e1', fontSize: 14, lineHeight: 1.7, paddingLeft: 22, margin: '0 0 8px' },

  tip: {
    display: 'flex', gap: 10, alignItems: 'flex-start',
    background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.3)',
    borderRadius: 10, padding: '12px 14px', marginTop: 14, color: '#fde68a', fontSize: 14, lineHeight: 1.5,
  },
  tipIcon: { fontSize: 18, flexShrink: 0 },

  table: { width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 14 },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  td: { padding: '10px 12px', borderBottom: '1px solid rgba(148,163,184,0.1)', color: '#cbd5e1' },
};
