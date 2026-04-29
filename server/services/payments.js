// Payment integration helpers.
//
// PayPal is the preferred provider. We support two flows:
//   1. PayPal — client gets an order id from /api/payments/paypal/create,
//      approves on PayPal, then calls /api/payments/paypal/capture.
//   2. Credit card — server takes the user's card, validates it locally
//      (Luhn check + expiry), strips everything except the last 4, and
//      records the purchase. NO full PAN is ever stored or logged.
//
// For local development without PayPal credentials we fall back to
// "sandbox mode" which mints a fake order id and treats capture as a
// no-op success. Set PAYPAL_CLIENT_ID + PAYPAL_SECRET in .env to enable
// the real PayPal REST API integration (api-m.paypal.com / sandbox).

const axios = require('axios');

const PAYPAL_BASE = process.env.PAYPAL_API_BASE
  || (process.env.NODE_ENV === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com');

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

// Create a PayPal order. Returns { orderId, approveUrl, sandbox }.
// Falls back to a fake sandbox order if PayPal isn't configured so the
// rest of the flow still works in development.
async function createPaypalOrder({ amountUSD, description }) {
  if (!paypalConfigured()) {
    return {
      orderId: `LOCAL-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      approveUrl: null,
      sandbox: true,
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
  return { orderId: data.id, approveUrl: approve?.href || null, sandbox: false };
}

// Capture an approved PayPal order. Returns { captured: true, status }.
// Fake-sandbox orders (LOCAL-*) always capture successfully.
async function capturePaypalOrder(orderId) {
  if (String(orderId).startsWith('LOCAL-') || !paypalConfigured()) {
    return { captured: true, status: 'COMPLETED', sandbox: true };
  }
  const token = await paypalAccessToken();
  const { data } = await axios.post(
    `${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`,
    {},
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 8000 }
  );
  return { captured: data.status === 'COMPLETED', status: data.status, sandbox: false };
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

module.exports = {
  paypalConfigured,
  createPaypalOrder,
  capturePaypalOrder,
  validateCard,
};
