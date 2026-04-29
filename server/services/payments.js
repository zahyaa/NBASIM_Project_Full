// Payment integration helpers.
//
// Two providers, both PCI-friendly (server never sees raw card numbers):
//   1. Stripe — client tokenizes the card via Stripe.js / Elements and sends
//      a paymentMethodId. Server creates a PaymentIntent off-session and the
//      client confirms it with the publishable key.
//   2. PayPal — client gets an order id from /api/payments/paypal/create,
//      approves on PayPal, then calls /api/payments/paypal/capture.
//
// The legacy /api/payments/credit-card endpoint is now deprecated and only
// remains for tests. It rejects in production. All real card flows go
// through Stripe.
//
// Set in .env (production):
//   STRIPE_SECRET_KEY=sk_live_...
//   STRIPE_PUBLISHABLE_KEY=pk_live_...
//   PAYPAL_CLIENT_ID=...
//   PAYPAL_SECRET=...
//   PAYPAL_API_BASE=https://api-m.paypal.com   (optional override)

const axios = require('axios');

const PAYPAL_BASE = process.env.PAYPAL_API_BASE
  || (process.env.NODE_ENV === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com');

let _stripe = null;
function stripe() {
  if (_stripe) return _stripe;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  // Lazy-require so tests without the env var don't hit the constructor.
  const Stripe = require('stripe');
  _stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  return _stripe;
}

function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

function stripePublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY || '';
}

function paypalConfigured() {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
}

async function paypalAccessToken() {
  if (!paypalConfigured()) return null;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
  const { data } = await axios.post(
    `${PAYPAL_BASE}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 8000,
    }
  );
  return data.access_token;
}

// Create a PayPal order. Returns { orderId, approveUrl }.
// When PayPal credentials are absent we mint a LOCAL-* order id so the dev
// flow still works without exposing a "sandbox" flag to the client.
async function createPaypalOrder({ amountUSD, description }) {
  if (!paypalConfigured()) {
    return {
      orderId: `LOCAL-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      approveUrl: null,
    };
  }
  const token = await paypalAccessToken();
  const { data } = await axios.post(
    `${PAYPAL_BASE}/v2/checkout/orders`,
    {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: 'USD', value: amountUSD.toFixed(2) },
        description,
      }],
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 8000 }
  );
  const approve = (data.links || []).find(l => l.rel === 'approve');
  return { orderId: data.id, approveUrl: approve?.href || null };
}

// Capture an approved PayPal order. Returns { captured, status, captureId }.
// Fake-sandbox orders (LOCAL-*) always capture successfully.
async function capturePaypalOrder(orderId) {
  if (String(orderId).startsWith('LOCAL-') || !paypalConfigured()) {
    return { captured: true, status: 'COMPLETED', captureId: null };
  }
  const token = await paypalAccessToken();
  const { data } = await axios.post(
    `${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`,
    {},
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 8000 }
  );
  const captureId = data?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
  return { captured: data.status === 'COMPLETED', status: data.status, captureId };
}

// Luhn check used as a basic sanity check on the card number. We never
// store the full PAN — the route calls validateCard, derives last4, and
// drops the original `number` field before persisting.
function luhnValid(cardNumber) {
  const digits = String(cardNumber || '').replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function validateCard({ number, expMonth, expYear, cvc }) {
  if (!luhnValid(number)) return { ok: false, error: 'Card number is invalid' };
  const m = Number(expMonth), y = Number(expYear);
  if (!(m >= 1 && m <= 12)) return { ok: false, error: 'Invalid expiry month' };
  const now = new Date();
  const expiry = new Date(y < 100 ? 2000 + y : y, m, 1); // first of month after expiry
  if (expiry <= now) return { ok: false, error: 'Card is expired' };
  if (!/^\d{3,4}$/.test(String(cvc || ''))) return { ok: false, error: 'Invalid CVC' };
  const last4 = String(number).replace(/\D/g, '').slice(-4);
  return { ok: true, last4 };
}

// ---- Stripe ---------------------------------------------------------------

// Refund a captured PayPal order. Returns { refunded, refundId, status }.
async function refundPaypalCapture(captureId, amountUSD) {
  if (!paypalConfigured() || !captureId || String(captureId).startsWith('LOCAL-')) {
    return { refunded: false, status: 'NOT_CONFIGURED' };
  }
  const token = await paypalAccessToken();
  const body = amountUSD
    ? { amount: { value: Number(amountUSD).toFixed(2), currency_code: 'USD' } }
    : {};
  const { data } = await axios.post(
    `${PAYPAL_BASE}/v2/payments/captures/${captureId}/refund`,
    body,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 8000 }
  );
  return { refunded: data.status === 'COMPLETED', refundId: data.id, status: data.status };
}

// Create a Stripe PaymentIntent. The client confirms it with Stripe.js using
// the returned clientSecret. Server NEVER touches the raw card.
async function createStripeIntent({ amountUSD, description, metadata }) {
  const s = stripe();
  if (!s) throw new Error('Stripe not configured');
  const intent = await s.paymentIntents.create({
    amount: Math.round(Number(amountUSD) * 100),
    currency: 'usd',
    description,
    metadata: metadata || {},
    automatic_payment_methods: { enabled: true },
  });
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

async function retrieveStripeIntent(paymentIntentId) {
  const s = stripe();
  if (!s) throw new Error('Stripe not configured');
  return s.paymentIntents.retrieve(paymentIntentId);
}

// Refund a Stripe PaymentIntent (full or partial).
async function refundStripeCharge(paymentIntentId, amountUSD) {
  const s = stripe();
  if (!s) throw new Error('Stripe not configured');
  const refund = await s.refunds.create({
    payment_intent: paymentIntentId,
    ...(amountUSD ? { amount: Math.round(Number(amountUSD) * 100) } : {}),
  });
  return { refunded: refund.status === 'succeeded', refundId: refund.id, status: refund.status };
}

module.exports = {
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
};
