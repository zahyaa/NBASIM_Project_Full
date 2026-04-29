// Token bundles, premium subscription, PayPal & credit card payment.
//
// PayPal: client calls /create -> approves on PayPal -> /capture.
// Credit card: client posts card -> server validates locally (Luhn + expiry)
// and drops everything except last4. NO full PAN ever leaves this file.

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const {
  TOKEN_BUNDLES,
  SUBSCRIPTION_PLANS,
  awardRewards,
} = require('../services/fantasyGM');
const {
  paypalConfigured,
  createPaypalOrder,
  capturePaypalOrder,
  refundPaypalCapture,
  stripeConfigured,
  stripePublishableKey,
  createStripeIntent,
  retrieveStripeIntent,
  refundStripeCharge,
  validateCard,
} = require('../services/payments');

const router = express.Router();

const SUB_DAYS = 30;

// GET /api/payments/catalog — token bundles + sub plans + which providers
// are configured. Used by the Store to render the buy-tokens UI.
router.get('/catalog', auth, async (_req, res) => {
  res.json({
    paypalEnabled: paypalConfigured(),
    stripeEnabled: stripeConfigured(),
    stripePublishableKey: stripePublishableKey(),
    // Legacy raw-card endpoint is only enabled outside production AND when
    // Stripe is not configured. Real card flows must go through Stripe.
    creditCardEnabled: !stripeConfigured() && process.env.NODE_ENV !== 'production',
    bundles: TOKEN_BUNDLES,
    plans: SUBSCRIPTION_PLANS,
  });
});

// POST /api/payments/paypal/create
// body: { kind: 'tokens' | 'subscription', bundleId? | tier? }
router.post('/paypal/create', auth, async (req, res) => {
  try {
    const { kind, bundleId, tier } = req.body || {};
    let amountUSD = 0;
    let description = '';
    if (kind === 'tokens') {
      const bundle = TOKEN_BUNDLES.find(b => b.bundleId === bundleId);
      if (!bundle) return res.status(400).json({ error: 'Unknown bundle' });
      amountUSD = bundle.priceUSD; description = `${bundle.name} (${bundle.tokens} tokens)`;
    } else if (kind === 'subscription') {
      const plan = SUBSCRIPTION_PLANS.find(p => p.tier === tier);
      if (!plan) return res.status(400).json({ error: 'Unknown plan' });
      amountUSD = plan.priceUSD; description = `${plan.name} (30 days)`;
    } else {
      return res.status(400).json({ error: 'kind must be tokens or subscription' });
    }
    const order = await createPaypalOrder({ amountUSD, description });
    res.json({ ...order, amountUSD, description });
  } catch (err) {
    res.status(502).json({ error: 'PayPal order failed', details: err.message });
  }
});

// POST /api/payments/paypal/capture
// body: { orderId, kind, bundleId? | tier? }
router.post('/paypal/capture', auth, async (req, res) => {
  try {
    const { orderId, kind, bundleId, tier } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    const cap = await capturePaypalOrder(orderId);
    if (!cap.captured) return res.status(400).json({ error: 'Capture failed', status: cap.status });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await applyPurchase(user, {
      kind, bundleId, tier, method: 'paypal',
      paypalOrderId: orderId,
      paypalCaptureId: cap.captureId || '',
      last4: '',
    });
    await user.save();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/stripe/intent
// body: { kind, bundleId? | tier? }
// Returns { clientSecret, paymentIntentId }. The client confirms with Stripe.js.
router.post('/stripe/intent', auth, async (req, res) => {
  try {
    if (!stripeConfigured()) return res.status(503).json({ error: 'Stripe not configured' });
    const { kind, bundleId, tier } = req.body || {};
    let amountUSD = 0; let description = '';
    if (kind === 'tokens') {
      const bundle = TOKEN_BUNDLES.find(b => b.bundleId === bundleId);
      if (!bundle) return res.status(400).json({ error: 'Unknown bundle' });
      amountUSD = bundle.priceUSD; description = `${bundle.name} (${bundle.tokens} tokens)`;
    } else if (kind === 'subscription') {
      const plan = SUBSCRIPTION_PLANS.find(p => p.tier === tier);
      if (!plan) return res.status(400).json({ error: 'Unknown plan' });
      amountUSD = plan.priceUSD; description = `${plan.name} (30 days)`;
    } else {
      return res.status(400).json({ error: 'kind must be tokens or subscription' });
    }
    const intent = await createStripeIntent({
      amountUSD, description,
      metadata: { userId: String(req.userId), kind, bundleId: bundleId || '', tier: tier || '' },
    });
    res.json({ ...intent, amountUSD, description });
  } catch (err) {
    res.status(502).json({ error: 'Stripe intent failed', details: err.message });
  }
});

// POST /api/payments/stripe/confirm
// body: { paymentIntentId, kind, bundleId? | tier? }
// Verifies the PaymentIntent succeeded server-side, then applies the purchase.
router.post('/stripe/confirm', auth, async (req, res) => {
  try {
    if (!stripeConfigured()) return res.status(503).json({ error: 'Stripe not configured' });
    const { paymentIntentId, kind, bundleId, tier } = req.body || {};
    if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId required' });
    const intent = await retrieveStripeIntent(paymentIntentId);
    if (intent.status !== 'succeeded') {
      return res.status(402).json({ error: 'Payment not completed', status: intent.status });
    }
    if (intent.metadata?.userId && intent.metadata.userId !== String(req.userId)) {
      return res.status(403).json({ error: 'PaymentIntent belongs to another user' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Avoid double-applying the same intent if the client retries.
    if (user.payments.some(p => p.stripePaymentIntentId === paymentIntentId)) {
      return res.json({ message: 'Already applied', tokens: user.tokens, duplicate: true });
    }
    const last4 = intent.charges?.data?.[0]?.payment_method_details?.card?.last4 || '';
    const result = await applyPurchase(user, {
      kind, bundleId, tier, method: 'stripe',
      paypalOrderId: '', paypalCaptureId: '',
      stripePaymentIntentId: paymentIntentId,
      last4,
    });
    await user.save();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/credit-card  (DEPRECATED)
// Kept only for non-production environments + tests so the existing local
// dev flow keeps working when Stripe isn't configured. Real card flows must
// use /api/payments/stripe/* so the server never sees raw PANs.
router.post('/credit-card', auth, async (req, res) => {
  if (process.env.NODE_ENV === 'production' || stripeConfigured()) {
    return res.status(410).json({
      error: 'This endpoint is disabled. Use Stripe (POST /api/payments/stripe/intent).',
    });
  }
  try {
    const { kind, bundleId, tier, card } = req.body || {};
    const v = validateCard(card || {});
    if (!v.ok) return res.status(400).json({ error: v.error });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await applyPurchase(user, { kind, bundleId, tier, method: 'credit-card', paypalOrderId: '', paypalCaptureId: '', last4: v.last4 });
    await user.save();
    res.json({ ...result, last4: v.last4 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply a verified purchase to the user record + emit news + run rewards.
async function applyPurchase(user, { kind, bundleId, tier, method, paypalOrderId, paypalCaptureId, stripePaymentIntentId, last4 }) {
  if (kind === 'tokens') {
    const bundle = TOKEN_BUNDLES.find(b => b.bundleId === bundleId);
    if (!bundle) throw new Error('Unknown bundle');
    user.tokens = (user.tokens || 0) + bundle.tokens;
    user.payments.push({
      kind: 'tokens', bundleId: bundle.bundleId, amountUSD: bundle.priceUSD,
      tokensAwarded: bundle.tokens, method,
      paypalOrderId: paypalOrderId || '',
      paypalCaptureId: paypalCaptureId || '',
      stripePaymentIntentId: stripePaymentIntentId || '',
      cardLast4: last4 || '',
    });
    const rewards = awardRewards(user);
    return {
      message: 'Tokens added',
      tokens: user.tokens,
      tokensAwarded: bundle.tokens,
      newAchievements: rewards.newAchievements,
      bonusTokens: rewards.tokensAwarded,
    };
  }
  if (kind === 'subscription') {
    const plan = SUBSCRIPTION_PLANS.find(p => p.tier === tier);
    if (!plan) throw new Error('Unknown plan');
    const now = new Date();
    const startFrom = (user.subscription?.paidUntil && user.subscription.paidUntil > now)
      ? new Date(user.subscription.paidUntil) : now;
    const paidUntil = new Date(startFrom.getTime() + SUB_DAYS * 24 * 60 * 60 * 1000);
    user.subscription = {
      tier: plan.tier,
      paidUntil,
      method,
      lastWeeklyBonusAt: now,
    };
    user.tokens = (user.tokens || 0) + plan.weeklyTokens;
    user.payments.push({
      kind: 'subscription', bundleId: plan.tier, amountUSD: plan.priceUSD,
      tokensAwarded: plan.weeklyTokens, method,
      paypalOrderId: paypalOrderId || '',
      paypalCaptureId: paypalCaptureId || '',
      stripePaymentIntentId: stripePaymentIntentId || '',
      cardLast4: last4 || '',
    });
    const rewards = awardRewards(user);
    return {
      message: `Subscribed to ${plan.name}`,
      tier: plan.tier,
      paidUntil: user.subscription.paidUntil,
      tokens: user.tokens,
      tokensAwarded: plan.weeklyTokens,
      newAchievements: rewards.newAchievements,
      bonusTokens: rewards.tokensAwarded,
    };
  }
  throw new Error('kind must be tokens or subscription');
}

// POST /api/payments/cancel-subscription — cancel renewal (current period stays).
router.post('/cancel-subscription', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.subscription.tier = 'free';
    user.subscription.method = '';
    await user.save();
    res.json({ message: 'Subscription cancelled', subscription: user.subscription });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/refund
// body: { paymentIndex }   (index into user.payments — returned by /history)
// Refunds via the original provider, marks the payment as refunded, and rolls
// back the awarded tokens. Subscriptions are also cancelled.
router.post('/refund', auth, async (req, res) => {
  try {
    const { paymentIndex } = req.body || {};
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const idx = Number(paymentIndex);
    const payment = user.payments?.[idx];
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.refunded) return res.status(409).json({ error: 'Already refunded' });
    // 30-day refund window.
    const ageMs = Date.now() - new Date(payment.createdAt).getTime();
    if (ageMs > 30 * 24 * 60 * 60 * 1000) {
      return res.status(403).json({ error: 'Refund window expired (30 days)' });
    }

    let refundResult = { refunded: false, status: 'NOT_PROCESSED', refundId: '' };
    if (payment.method === 'stripe' && payment.stripePaymentIntentId) {
      refundResult = await refundStripeCharge(payment.stripePaymentIntentId, payment.amountUSD);
    } else if (payment.method === 'paypal' && payment.paypalCaptureId) {
      refundResult = await refundPaypalCapture(payment.paypalCaptureId, payment.amountUSD);
    } else if (payment.method === 'credit-card') {
      // Legacy validate-only flow has no real charge to reverse — mark refunded.
      refundResult = { refunded: true, status: 'LEGACY_VOIDED', refundId: '' };
    }
    if (!refundResult.refunded) {
      return res.status(502).json({ error: 'Provider refund failed', status: refundResult.status });
    }

    payment.refunded = true;
    payment.refundedAt = new Date();
    payment.refundId = refundResult.refundId || '';
    // Roll back awarded tokens (don't go negative).
    user.tokens = Math.max(0, (user.tokens || 0) - (payment.tokensAwarded || 0));
    // Cancel subscription if this purchase activated it.
    if (payment.kind === 'subscription') {
      user.subscription.tier = 'free';
      user.subscription.method = '';
      user.subscription.paidUntil = null;
    }
    await user.save();
    res.json({
      message: 'Refund completed',
      refundId: payment.refundId,
      amountUSD: payment.amountUSD,
      tokens: user.tokens,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/history — list the user's payments for a refund UI.
router.get('/history', auth, async (req, res) => {
  const user = await User.findById(req.userId).select('payments');
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    payments: (user.payments || []).map((p, i) => ({
      index: i,
      kind: p.kind,
      bundleId: p.bundleId,
      amountUSD: p.amountUSD,
      tokensAwarded: p.tokensAwarded,
      method: p.method,
      cardLast4: p.cardLast4,
      refunded: !!p.refunded,
      refundedAt: p.refundedAt,
      createdAt: p.createdAt,
    })),
  });
});

module.exports = router;
