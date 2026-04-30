// Sprint I — weekly subscriber bonus scheduler.
//
// Grants the recurring perks listed in `SUBSCRIPTION_PLANS` (see
// services/fantasyGM.js) to every user with an active subscription whose
// `lastWeeklyBonusAt` is more than 7 days in the past.
//
// Implementation: a lightweight `setInterval` loop instead of a real cron.
// This avoids adding `node-cron` as a dependency and keeps everything in
// process. The interval is no-op in test mode so unit tests can't trip it.

const User = require('../models/User');

// Subscription perks live alongside the rest of the league config.
const { SUBSCRIPTION_PLANS } = (() => {
  try {
    const mod = require('./fantasyGM');
    if (mod.SUBSCRIPTION_PLANS) return mod;
  } catch (_) { /* ignore */ }
  // Fallback (matches the inline copy in fantasyGM.js).
  return {
    SUBSCRIPTION_PLANS: [
      { tier: 'premium', weeklyTokens: 250 },
      { tier: 'gm-elite', weeklyTokens: 750 },
    ],
  };
})();

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TICK_MS = 60 * 60 * 1000; // 1 hour

/**
 * Run a single bonus pass. Exported so tests / admin tools can trigger it
 * directly without waiting on the timer. Returns the number of users who
 * received a bonus this pass.
 */
async function runWeeklyBonusPass(now = new Date()) {
  const eligibleTiers = SUBSCRIPTION_PLANS.map(p => p.tier).filter(t => t !== 'free');
  const cutoff = new Date(now.getTime() - ONE_WEEK_MS);

  const candidates = await User.find({
    'subscription.tier': { $in: eligibleTiers },
    'subscription.paidUntil': { $gt: now },
    $or: [
      { 'subscription.lastWeeklyBonusAt': null },
      { 'subscription.lastWeeklyBonusAt': { $lte: cutoff } },
    ],
  });

  let granted = 0;
  for (const user of candidates) {
    const plan = SUBSCRIPTION_PLANS.find(p => p.tier === user.subscription.tier);
    if (!plan?.weeklyTokens) continue;
    user.tokens = (user.tokens || 0) + plan.weeklyTokens;
    user.subscription.lastWeeklyBonusAt = now;
    user.payments = user.payments || {};
    user.payments.history = user.payments.history || [];
    user.payments.history.push({
      kind: 'subscription',
      bundleId: `weekly-${plan.tier}`,
      tokensAwarded: plan.weeklyTokens,
      amountUSD: 0,
      createdAt: now,
      provider: 'system',
    });
    try {
      await user.save();
      granted++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('weekly bonus save failed', user._id, err.message);
    }
  }
  return granted;
}

let _timer = null;
function startScheduler() {
  if (process.env.NODE_ENV === 'test') return;
  if (_timer) return;
  // Run once on boot (after a short delay so DB is ready) then every hour.
  setTimeout(() => {
    runWeeklyBonusPass().catch(err => console.error('weekly bonus pass failed', err));
  }, 30 * 1000);
  _timer = setInterval(() => {
    runWeeklyBonusPass().catch(err => console.error('weekly bonus pass failed', err));
  }, TICK_MS);
  if (_timer.unref) _timer.unref(); // don't hold the event loop open
}

function stopScheduler() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { runWeeklyBonusPass, startScheduler, stopScheduler };
