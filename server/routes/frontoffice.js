// Sprint A1 — Front Office API.
// GET /api/frontoffice/finance — cap, payroll, tax, contract table.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const {
  buildFinanceSummary,
  refreshUserFinance,
  calculatePayroll,
  canAbsorbContract,
  ROSTER_MIN,
  ROSTER_MAX,
  MIN_PAYROLL,
  MID_LEVEL_EXCEPTION,
} = require('../services/contracts');
const {
  generateCpuOffers,
  resolveFreeAgent,
  rosterEntryFromOffer,
} = require('../services/freeAgency');

const router = express.Router();

router.get('/finance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const finance = refreshUserFinance(user);
    await user.save();

    const contracts = (user.team?.players || []).map(p => ({
      playerId: p.playerId,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      rating: p.rating,
      salary: p.contract?.salary || 0,
      yearsRemaining: p.contract?.yearsRemaining || p.contract?.years || 0,
      contractType: p.contract?.contractType || 'minimum',
      teamOption: !!p.contract?.teamOption,
      playerOption: !!p.contract?.playerOption,
      noTradeClause: !!p.contract?.noTradeClause,
    }));

    // Highest-paid first.
    contracts.sort((a, b) => b.salary - a.salary);

    // CPU team payrolls so the user can see league context.
    const cpuPayrolls = (user.cpuTeams || []).map(t => ({
      name: t.name,
      city: t.city,
      payroll: calculatePayroll(t),
    })).sort((a, b) => b.payroll - a.payroll);

    res.json({
      team: {
        name: user.team?.name || '',
        city: user.team?.city || '',
      },
      finance,
      contracts,
      rosterSize: contracts.length,
      rosterMin: ROSTER_MIN,
      rosterMax: ROSTER_MAX,
      minPayroll: MIN_PAYROLL,
      overCap: finance.payroll > finance.salaryCap,
      overTax: finance.payroll > finance.luxuryTaxLine,
      cpuPayrolls,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/frontoffice/freeagents — return the league free agent pool with
// a quick fit summary for the user (can-afford + cap impact). Sorted by
// rating desc.
router.get('/freeagents', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    refreshUserFinance(user);
    const finance = user.finance || {};
    const pool = (user.freeAgents || []).slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));

    const enriched = pool.map(p => {
      const salary = p.askingSalary || 0;
      const projected = (finance.payroll || 0) + salary;
      const canAfford = projected <= (finance.salaryCap || 140);
      const needsMLE = !canAfford && projected <= (finance.salaryCap || 140) + 12 && salary <= 12;
      return {
        playerId: p.playerId,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        rating: p.rating,
        previousTeam: p.previousTeam,
        askingSalary: salary,
        askingYears: p.askingYears,
        canAfford,
        needsMLE,
        projectedPayroll: Math.round(projected * 10) / 10,
      };
    });

    res.json({
      finance,
      freeAgents: enriched,
      total: enriched.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/frontoffice/expiring — list user's own players whose contracts
// expire after this season. Used by the re-signing window UI.
router.get('/expiring', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const expiring = (user.team?.players || [])
      .filter(p => {
        const yr = p.contract?.yearsRemaining ?? p.contract?.years ?? 0;
        return yr <= 1;
      })
      .map(p => ({
        playerId: p.playerId,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        rating: p.rating,
        currentSalary: p.contract?.salary || 0,
        yearsRemaining: p.contract?.yearsRemaining ?? p.contract?.years ?? 0,
      }));

    res.json({ expiring });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/frontoffice/resign — body: { playerId, salary, years }
// Re-sign one of your own expiring players before they hit the open
// market. Allowed any time the player is still on the roster.
router.post('/resign', auth, async (req, res) => {
  try {
    const { playerId, salary, years } = req.body || {};
    if (!playerId || !salary || !years) {
      return res.status(400).json({ error: 'playerId, salary, years required' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const p = (user.team.players || []).find(x => Number(x.playerId) === Number(playerId));
    if (!p) return res.status(404).json({ error: 'Player not on your roster' });

    // Cap legality on the *new* contract — we replace the old one, so
    // first subtract the existing salary from payroll for the check.
    refreshUserFinance(user);
    const oldSalary = p.contract?.salary || 0;
    const projected = (user.finance.payroll || 0) - oldSalary + Number(salary);
    if (projected > (user.finance.salaryCap || 140) + MID_LEVEL_EXCEPTION) {
      return res.status(400).json({
        error: `Re-signing would push payroll to $${projected.toFixed(1)}M, over the hard cap.`,
      });
    }

    p.contract = {
      salary: Number(salary),
      yearsRemaining: Number(years),
      years: Number(years),
      contractType: p.rating >= 85 ? 'max' : p.rating >= 75 ? 'standard' : 'standard',
      teamOption: false,
      playerOption: false,
      noTradeClause: p.rating >= 92,
      signedAt: new Date(),
    };
    user.markModified('team');
    refreshUserFinance(user);
    await user.save();
    res.json({ message: `Re-signed ${p.firstName} ${p.lastName}`, team: user.team, finance: user.finance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/frontoffice/offer — body: { playerId, salary, years }
// User makes an offer on a free agent. Spawns 0-3 CPU competing offers
// and stores everything in user.freeAgentOffers for /resolve to award.
router.post('/offer', auth, async (req, res) => {
  try {
    const { playerId, salary, years } = req.body || {};
    if (!playerId || !salary || !years) {
      return res.status(400).json({ error: 'playerId, salary, years required' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const fa = (user.freeAgents || []).find(p => Number(p.playerId) === Number(playerId));
    if (!fa) return res.status(404).json({ error: 'Player is not a free agent' });

    // Roster + cap legality.
    if ((user.team.players || []).length >= ROSTER_MAX) {
      return res.status(400).json({ error: `Roster cap of ${ROSTER_MAX} reached — release someone first` });
    }
    refreshUserFinance(user);
    const check = canAbsorbContract({
      team: user.team,
      finance: user.finance,
      newSalary: Number(salary),
    });
    if (!check.ok) return res.status(400).json({ error: check.reason });

    // Replace any prior user offer; CPU offers are re-rolled each time
    // so the user can negotiate without lock-in.
    const cpuOffers = generateCpuOffers(fa, user.cpuTeams || []);
    const userOffer = {
      teamName: user.team.name || 'You',
      teamCity: user.team.city || '',
      salary: Number(salary),
      years: Number(years),
      isUser: true,
      usesMLE: !!check.requiresMLE,
      teamWinsLastSeason: user.career?.[user.career.length - 1]?.wins || user.seasonWins || 30,
      marketTier: user.team.marketTier || 'III',
    };

    const idx = (user.freeAgentOffers || []).findIndex(e => Number(e.playerId) === Number(playerId));
    const entry = { playerId: Number(playerId), offers: [userOffer, ...cpuOffers], createdAt: new Date() };
    if (idx >= 0) user.freeAgentOffers[idx] = entry;
    else          user.freeAgentOffers.push(entry);
    user.markModified('freeAgentOffers');

    await user.save();
    res.json({
      message: `Offer submitted to ${fa.firstName} ${fa.lastName}`,
      cpuOffers: cpuOffers.length,
      offers: entry.offers,
      askingSalary: fa.askingSalary,
      askingYears: fa.askingYears,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/frontoffice/offers/resolve — resolve every pending offer.
// For each FA, the highest-scoring offer above the decline threshold wins.
// User wins → roster entry + cap. CPU wins → goes to that CPU team.
// Player declines → stays in pool. Pending offers are cleared after.
router.post('/offers/resolve', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const results = [];
    const remainingFAs = [];
    const claimed = new Set();

    for (const fa of (user.freeAgents || [])) {
      const entry = (user.freeAgentOffers || []).find(e => Number(e.playerId) === Number(fa.playerId));
      if (!entry || !entry.offers.length) {
        remainingFAs.push(fa);
        continue;
      }
      const { winner, declined, threshold } = resolveFreeAgent(fa, entry.offers);
      if (declined || !winner) {
        results.push({
          playerId: fa.playerId,
          name: `${fa.firstName} ${fa.lastName}`,
          outcome: 'declined',
          threshold,
        });
        remainingFAs.push(fa);
        continue;
      }
      const w = winner.offer;
      claimed.add(fa.playerId);

      if (w.isUser) {
        // User wins. Re-validate cap (state may have shifted) and sign.
        refreshUserFinance(user);
        const check = canAbsorbContract({
          team: user.team,
          finance: user.finance,
          newSalary: w.salary,
        });
        if (!check.ok || (user.team.players || []).length >= ROSTER_MAX) {
          results.push({
            playerId: fa.playerId,
            name: `${fa.firstName} ${fa.lastName}`,
            outcome: 'user-cap-fail',
            reason: check.reason || 'Roster full',
          });
          remainingFAs.push(fa);
          continue;
        }
        if (check.requiresMLE) user.finance.midLevelExceptionAvailable = false;
        user.team.players.push(rosterEntryFromOffer(fa, w));
        results.push({
          playerId: fa.playerId,
          name: `${fa.firstName} ${fa.lastName}`,
          outcome: 'signed-user',
          salary: w.salary,
          years: w.years,
        });
      } else {
        // CPU wins. Push onto that team's roster.
        const cpu = user.cpuTeams.find(t => t.name === w.teamName);
        if (cpu && (cpu.players || []).length < ROSTER_MAX) {
          cpu.players.push(rosterEntryFromOffer(fa, w));
          results.push({
            playerId: fa.playerId,
            name: `${fa.firstName} ${fa.lastName}`,
            outcome: 'signed-cpu',
            team: w.teamName,
            salary: w.salary,
            years: w.years,
          });
        } else {
          remainingFAs.push(fa);
        }
      }
    }

    user.freeAgents = remainingFAs.filter(p => !claimed.has(p.playerId));
    user.freeAgentOffers = [];
    user.markModified('team');
    user.markModified('cpuTeams');
    user.markModified('freeAgents');
    user.markModified('freeAgentOffers');
    refreshUserFinance(user);
    await user.save();

    res.json({
      message: 'Offers resolved',
      results,
      finance: user.finance,
      remainingFAs: user.freeAgents.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;