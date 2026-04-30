// Sprint A4 — Trade routes.
// All endpoints are auth-protected and operate on the current user's team
// against one of the league's CPU teams.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const {
  ensureA4Fields,
  validateSalaryMatch,
  enforceNoTradeClause,
  validateRosterSizes,
  cpuAcceptanceScore,
  executeTrade,
  generateCpuProposals,
  isPastTradeDeadline,
  TRADE_DEADLINE_GAMES,
  playerSnapshot,
  pickSnapshot,
} = require('../services/trades');
const { refreshUserFinance } = require('../services/contracts');

const router = express.Router();

// ----------------------------------------------------------------- helpers

function findCpu(user, name) {
  return (user.cpuTeams || []).find(t => t.name === name);
}

function findUserPlayers(user, ids) {
  const out = [];
  for (const id of ids || []) {
    const p = (user.team.players || []).find(x => Number(x.playerId) === Number(id));
    if (!p) return { error: `Player ${id} not on your roster` };
    out.push(p);
  }
  return { players: out };
}

function findCpuPlayers(cpu, ids) {
  const out = [];
  for (const id of ids || []) {
    const p = (cpu.players || []).find(x => Number(x.playerId) === Number(id));
    if (!p) return { error: `Player ${id} not on ${cpu.name}` };
    out.push(p);
  }
  return { players: out };
}

function findPicks(owner, pickIds) {
  const out = [];
  for (const id of pickIds || []) {
    const pk = (owner.ownedPicks || []).find(x => x.pickId === id);
    if (!pk) return { error: `Pick ${id} not owned by ${owner.name || owner.team?.name || 'team'}` };
    out.push(pk);
  }
  return { picks: out };
}

// --------------------------------------------------------------- GET state

// GET /api/trades/state — picks, history, pending CPU proposals, deadline.
router.get('/state', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureA4Fields(user);
    await user.save();

    const played = (user.schedule || []).filter(g => g.played).length;
    res.json({
      ownedPicks: user.ownedPicks || [],
      tradeHistory: user.tradeHistory || [],
      cpuTradeProposals: user.cpuTradeProposals || [],
      tradeDeadline: {
        deadlineGames: TRADE_DEADLINE_GAMES,
        gamesPlayed: played,
        locked: isPastTradeDeadline(user),
      },
      cpuTeams: (user.cpuTeams || []).map(t => ({
        name: t.name,
        city: t.city,
        direction: t.direction || 'middling',
        rosterSize: (t.players || []).length,
        ownedPicks: (t.ownedPicks || []).length,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trades/team/:name — full roster + picks of one CPU team for the
// trade machine UI.
router.get('/team/:name', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureA4Fields(user);

    const cpu = findCpu(user, req.params.name);
    if (!cpu) return res.status(404).json({ error: 'CPU team not found' });

    res.json({
      name: cpu.name,
      city: cpu.city,
      direction: cpu.direction || 'middling',
      players: (cpu.players || []).map(playerSnapshot),
      picks: (cpu.ownedPicks || []).map(pickSnapshot),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------- propose

// POST /api/trades/propose
// body: { cpuTeam, sendPlayerIds, sendPickIds, receivePlayerIds, receivePickIds, approve? }
router.post('/propose', auth, async (req, res) => {
  try {
    const { cpuTeam, sendPlayerIds = [], sendPickIds = [], receivePlayerIds = [], receivePickIds = [], approve = [] } = req.body || {};
    if (!cpuTeam) return res.status(400).json({ error: 'cpuTeam required' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureA4Fields(user);

    if (isPastTradeDeadline(user)) {
      return res.status(400).json({ error: 'Trade deadline has passed.' });
    }

    const cpu = findCpu(user, cpuTeam);
    if (!cpu) return res.status(404).json({ error: 'CPU team not found' });

    const u = findUserPlayers(user, sendPlayerIds);
    if (u.error) return res.status(400).json({ error: u.error });
    const c = findCpuPlayers(cpu, receivePlayerIds);
    if (c.error) return res.status(400).json({ error: c.error });
    const up = findPicks({ ownedPicks: user.ownedPicks }, sendPickIds);
    if (up.error) return res.status(400).json({ error: up.error });
    const cp = findPicks(cpu, receivePickIds);
    if (cp.error) return res.status(400).json({ error: cp.error });

    if (u.players.length === 0 && up.picks.length === 0) {
      return res.status(400).json({ error: 'You must send at least one player or pick.' });
    }
    if (c.players.length === 0 && cp.picks.length === 0) {
      return res.status(400).json({ error: 'You must receive at least one player or pick.' });
    }

    // No-trade clause check on sent players.
    const ntc = enforceNoTradeClause(u.players, approve);
    if (!ntc.ok) {
      return res.status(400).json({
        error: 'No-trade clause: approval required.',
        blocked: ntc.blocked,
      });
    }

    // Salary matching using the user's current finance state.
    refreshUserFinance(user);
    const sm = validateSalaryMatch(u.players, c.players, user.finance);
    if (!sm.ok) return res.status(400).json({ error: sm.reason });

    // Roster size both directions.
    const r1 = validateRosterSizes(user.team, u.players, c.players);
    if (!r1.ok) return res.status(400).json({ error: r1.reason });
    const r2 = validateRosterSizes(cpu, c.players, u.players);
    if (!r2.ok) return res.status(400).json({ error: r2.reason });

    // CPU acceptance.
    const score = cpuAcceptanceScore({
      cpuTeam: cpu,
      sendPlayers: u.players,
      sendPicks: up.picks,
      receivePlayers: c.players,
      receivePicks: cp.picks,
    });

    if (score < 0) {
      return res.json({
        accepted: false,
        score,
        message: `${cpu.name} reject the offer (score ${score}).`,
      });
    }

    // Accepted — execute.
    const tradeId = executeTrade(user, cpu, u.players, up.picks, c.players, cp.picks, 'user');
    await user.save();

    res.json({
      accepted: true,
      score,
      tradeId,
      message: `${cpu.name} accepted the trade!`,
      finance: user.finance,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------- respond

// POST /api/trades/respond — accept/reject a CPU-initiated proposal.
// body: { proposalId, accept }
router.post('/respond', auth, async (req, res) => {
  try {
    const { proposalId, accept } = req.body || {};
    if (!proposalId) return res.status(400).json({ error: 'proposalId required' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    ensureA4Fields(user);

    const idx = (user.cpuTradeProposals || []).findIndex(p => p.proposalId === proposalId);
    if (idx < 0) return res.status(404).json({ error: 'Proposal not found' });
    const proposal = user.cpuTradeProposals[idx];

    if (!accept) {
      user.cpuTradeProposals.splice(idx, 1);
      user.markModified('cpuTradeProposals');
      await user.save();
      return res.json({ accepted: false, message: 'Proposal declined.' });
    }

    if (isPastTradeDeadline(user)) {
      return res.status(400).json({ error: 'Trade deadline has passed.' });
    }

    const cpu = findCpu(user, proposal.partnerTeam);
    if (!cpu) return res.status(404).json({ error: 'Partner team not found' });

    const u = findUserPlayers(user, proposal.sendPlayerIds);
    if (u.error) return res.status(400).json({ error: u.error });
    const up = findPicks({ ownedPicks: user.ownedPicks }, proposal.sendPickIds);
    if (up.error) return res.status(400).json({ error: up.error });

    // Resolve receive players/picks against current CPU roster (snapshots
    // are stored, but we re-reference live players for cap/state integrity).
    const receivePlayers = (proposal.receivePlayers || [])
      .map(rp => (cpu.players || []).find(x => Number(x.playerId) === Number(rp.playerId)))
      .filter(Boolean);
    const receivePicks = (proposal.receivePicks || [])
      .map(rp => (cpu.ownedPicks || []).find(x => x.pickId === rp.pickId))
      .filter(Boolean);

    if (receivePlayers.length !== (proposal.receivePlayers || []).length ||
        receivePicks.length   !== (proposal.receivePicks   || []).length) {
      // Asset moved; proposal is stale.
      user.cpuTradeProposals.splice(idx, 1);
      user.markModified('cpuTradeProposals');
      await user.save();
      return res.status(400).json({ error: 'Proposal is stale (an asset has moved).', accepted: false });
    }

    refreshUserFinance(user);
    const sm = validateSalaryMatch(u.players, receivePlayers, user.finance);
    if (!sm.ok) return res.status(400).json({ error: sm.reason });
    const r1 = validateRosterSizes(user.team, u.players, receivePlayers);
    if (!r1.ok) return res.status(400).json({ error: r1.reason });
    const r2 = validateRosterSizes(cpu, receivePlayers, u.players);
    if (!r2.ok) return res.status(400).json({ error: r2.reason });

    const tradeId = executeTrade(user, cpu, u.players, up.picks, receivePlayers, receivePicks, 'cpu');
    user.cpuTradeProposals.splice(idx, 1);
    user.markModified('cpuTradeProposals');
    await user.save();

    res.json({ accepted: true, tradeId, message: `Trade with ${cpu.name} executed.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------- history

// GET /api/trades/history — full trade log.
router.get('/history', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ tradeHistory: user.tradeHistory || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------- cpu-tick

// POST /api/trades/cpu-tick — testing/debug helper to force a CPU proposal.
router.post('/cpu-tick', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const made = generateCpuProposals(user);
    await user.save();
    res.json({ proposalsCreated: made, total: user.cpuTradeProposals.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
