// Subscription + token bundle store. Stripe (Elements + PaymentIntent) is the
// primary card processor — the server NEVER sees raw PANs. PayPal is the
// alternate provider. The legacy raw-card form is only available in dev when
// Stripe isn't configured.
import React, { useEffect, useState, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// loadStripe is memoized per publishable key so Elements only initializes once.
const stripePromiseCache = {};
function getStripe(pk) {
  if (!pk) return null;
  if (!stripePromiseCache[pk]) stripePromiseCache[pk] = loadStripe(pk);
  return stripePromiseCache[pk];
}

export default function SubscribePage() {
  const { token, user, setUser } = useAuth();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState({
    bundles: [], plans: [], paypalEnabled: false,
    stripeEnabled: false, stripePublishableKey: '',
    creditCardEnabled: false,
  });
  const [tab, setTab] = useState('tokens');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [method, setMethod] = useState('paypal');
  const [card, setCard] = useState({ number: '', expMonth: '', expYear: '', cvc: '', name: '' });
  const [stripeIntent, setStripeIntent] = useState(null);
  const [history, setHistory] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/payments/catalog', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCatalog(data);
      if (data.stripeEnabled) setMethod('stripe');
      else if (data.paypalEnabled) setMethod('paypal');
      else if (data.creditCardEnabled) setMethod('credit-card');
      else setMethod('paypal');
    } catch (err) { setError(err.message); }
  }, [token]);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/payments/history', { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (r.ok) setHistory(data.payments || []);
    } catch (_e) { /* non-fatal */ }
  }, [token]);

  useEffect(() => { load(); loadHistory(); }, [load, loadHistory]);

  const refreshUser = async () => {
    const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    setUser(await r.json());
    loadHistory();
  };

  // ---- PayPal ------------------------------------------------------------
  async function buyPaypal({ kind, bundleId, tier }) {
    setBusy(true); setError(''); setInfo('');
    try {
      const create = await fetch('/api/payments/paypal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, bundleId, tier }),
      }).then(r => r.json());
      if (create.error) throw new Error(create.error);
      // In production, redirect to create.approveUrl and capture on return.
      // For LOCAL-* (no PayPal creds) we capture immediately so dev still works.
      const cap = await fetch('/api/payments/paypal/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: create.orderId, kind, bundleId, tier }),
      }).then(r => r.json());
      if (cap.error) throw new Error(cap.error);
      setInfo(cap.message);
      await refreshUser();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  // ---- Stripe ------------------------------------------------------------
  async function startStripe({ kind, bundleId, tier }) {
    setBusy(true); setError(''); setInfo('');
    try {
      const r = await fetch('/api/payments/stripe/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, bundleId, tier }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Stripe init failed');
      setStripeIntent({ ...data, kind, bundleId, tier });
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  // ---- Legacy dev card --------------------------------------------------
  async function buyCard({ kind, bundleId, tier }) {
    setBusy(true); setError(''); setInfo('');
    try {
      const res = await fetch('/api/payments/credit-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind, bundleId, tier, card }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setInfo(`${res.message} (card ending ${res.last4})`);
      setCard({ number: '', expMonth: '', expYear: '', cvc: '', name: '' });
      await refreshUser();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  const buy = (target) => {
    if (method === 'stripe') return startStripe(target);
    if (method === 'paypal') return buyPaypal(target);
    return buyCard(target);
  };

  async function refundPayment(idx) {
    if (!window.confirm('Refund this purchase? Awarded tokens will be returned.')) return;
    setBusy(true); setError(''); setInfo('');
    try {
      const r = await fetch('/api/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentIndex: idx }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Refund failed');
      setInfo(`Refunded $${data.amountUSD?.toFixed?.(2) || data.amountUSD}`);
      await refreshUser();
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  const subActive = user?.subscription?.tier && user.subscription.tier !== 'free';

  return (
    <div style={s.container} data-testid="subscribe-page">
      <button onClick={() => navigate('/menu')} style={s.backBtn}>&larr; Main Menu</button>
      <div style={s.header}>
        <h1 style={s.title}>💳 Tokens & Premium</h1>
        <p style={s.subtitle}>Balance: <strong style={{ color: '#facc15' }}>{user?.tokens || 0}</strong> tokens</p>
        {subActive && (
          <p style={s.subBadge}>
            ✨ {user.subscription.tier === 'gm-elite' ? 'GM Elite' : 'Premium GM'} active
            {user.subscription.paidUntil && ` · until ${new Date(user.subscription.paidUntil).toLocaleDateString()}`}
          </p>
        )}
      </div>

      <div style={s.tabs}>
        <button onClick={() => setTab('tokens')} style={{ ...s.tab, ...(tab === 'tokens' ? s.activeTab : {}) }}>Buy Tokens</button>
        <button onClick={() => setTab('subscription')} style={{ ...s.tab, ...(tab === 'subscription' ? s.activeTab : {}) }}>Subscription</button>
        <button onClick={() => setTab('history')} style={{ ...s.tab, ...(tab === 'history' ? s.activeTab : {}) }}>History</button>
      </div>

      <div style={s.methodRow}>
        <label style={{ marginRight: 16 }}>Pay with:</label>
        {catalog.stripeEnabled && (
          <button
            onClick={() => setMethod('stripe')}
            style={{ ...s.methodBtn, ...(method === 'stripe' ? s.activeMethod : {}) }}
            data-testid="pay-stripe"
          >
            Card (Stripe)
          </button>
        )}
        <button
          onClick={() => setMethod('paypal')}
          style={{ ...s.methodBtn, ...(method === 'paypal' ? s.activeMethod : {}) }}
          data-testid="pay-paypal"
        >
          PayPal
        </button>
        {catalog.creditCardEnabled && (
          <button onClick={() => setMethod('credit-card')} style={{ ...s.methodBtn, ...(method === 'credit-card' ? s.activeMethod : {}) }} data-testid="pay-card">
            Card (dev only)
          </button>
        )}
      </div>

      {method === 'credit-card' && (
        <div style={s.cardForm}>
          <div style={{ background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.4)', color: '#fde68a', padding: '10px 12px', borderRadius: 8, marginBottom: 10, fontSize: 13, lineHeight: 1.5 }}>
            <strong>Dev-only stub.</strong> This raw-card form does NOT process real charges and is only available outside production. The live site uses Stripe — your card never touches our servers.
          </div>
          <input placeholder="Card Number" value={card.number} onChange={e => setCard({ ...card, number: e.target.value })} style={s.input} />
          <input placeholder="Name on card" value={card.name} onChange={e => setCard({ ...card, name: e.target.value })} style={s.input} />
          <input placeholder="MM" maxLength={2} value={card.expMonth} onChange={e => setCard({ ...card, expMonth: e.target.value })} style={{ ...s.input, width: 60 }} />
          <input placeholder="YYYY" maxLength={4} value={card.expYear} onChange={e => setCard({ ...card, expYear: e.target.value })} style={{ ...s.input, width: 80 }} />
          <input placeholder="CVC" maxLength={4} value={card.cvc} onChange={e => setCard({ ...card, cvc: e.target.value })} style={{ ...s.input, width: 70 }} />
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}
      {info && <div style={s.info}>{info}</div>}

      {stripeIntent && catalog.stripeEnabled && (
        <Elements
          stripe={getStripe(catalog.stripePublishableKey)}
          options={{ clientSecret: stripeIntent.clientSecret, appearance: { theme: 'night' } }}
        >
          <StripeCheckout
            intent={stripeIntent}
            token={token}
            onCancel={() => setStripeIntent(null)}
            onSuccess={async (msg) => {
              setStripeIntent(null);
              setInfo(msg);
              await refreshUser();
            }}
            onError={(msg) => setError(msg)}
          />
        </Elements>
      )}

      {tab === 'tokens' && (
        <div style={s.grid}>
          {catalog.bundles.map(b => (
            <div key={b.bundleId} style={s.card}>
              <h3 style={{ margin: 0, color: '#facc15' }}>{b.name}</h3>
              <div style={s.tokenAmt}>{b.tokens.toLocaleString()} tokens</div>
              <div style={s.price}>${b.priceUSD}</div>
              <button onClick={() => buy({ kind: 'tokens', bundleId: b.bundleId })} disabled={busy} style={s.buyBtn}>Buy</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'subscription' && (
        <div style={s.grid}>
          {catalog.plans.map(p => (
            <div key={p.tier} style={{ ...s.card, ...(p.tier === 'gm-elite' ? s.eliteCard : {}) }}>
              <h3 style={{ margin: 0, color: p.tier === 'gm-elite' ? '#a855f7' : '#facc15' }}>{p.name}</h3>
              <div style={s.price}>${p.priceUSD}/mo</div>
              <ul style={{ paddingLeft: 18, fontSize: 13, color: '#cbd5e1' }}>
                {p.perks.map((perk, i) => <li key={i}>{perk}</li>)}
              </ul>
              <button onClick={() => buy({ kind: 'subscription', tier: p.tier })} disabled={busy} style={s.buyBtn}>Subscribe</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {history.length === 0 && <div style={{ color: '#94a3b8', textAlign: 'center' }}>No purchases yet.</div>}
          {history.map(p => (
            <div key={p.index} style={s.histRow}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{p.kind === 'tokens' ? `Tokens: ${p.bundleId}` : `Subscription: ${p.bundleId}`}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {new Date(p.createdAt).toLocaleString()} · {p.method}
                  {p.cardLast4 && ` · •••• ${p.cardLast4}`}
                </div>
              </div>
              <div style={{ marginRight: 12, color: '#10b981', fontWeight: 700 }}>${p.amountUSD}</div>
              {p.refunded ? (
                <span style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>refunded</span>
              ) : (
                <button onClick={() => refundPayment(p.index)} disabled={busy} style={s.refundBtn}>Refund</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Stripe Elements form — runs inside <Elements>.
function StripeCheckout({ intent, token, onCancel, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });
      if (confirmError) throw new Error(confirmError.message);
      if (paymentIntent?.status !== 'succeeded') {
        throw new Error(`Payment status: ${paymentIntent?.status || 'unknown'}`);
      }
      const r = await fetch('/api/payments/stripe/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          kind: intent.kind,
          bundleId: intent.bundleId,
          tier: intent.tier,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Server confirm failed');
      onSuccess(data.message || 'Payment complete');
    } catch (err) {
      onError(err.message);
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} style={s.stripeBox}>
      <div style={{ marginBottom: 8, fontWeight: 700 }}>{intent.description} — ${intent.amountUSD}</div>
      <PaymentElement />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="submit" disabled={!stripe || submitting} style={s.buyBtn}>
          {submitting ? 'Processing…' : `Pay $${intent.amountUSD}`}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} style={{ ...s.buyBtn, background: '#475569' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const s = {
  container: { padding: 24, color: '#fff', minHeight: '100vh', background: '#0f172a' },
  backBtn: { background: 'transparent', color: '#60a5fa', border: 'none', cursor: 'pointer', fontSize: 14, marginBottom: 16 },
  header: { textAlign: 'center', marginBottom: 16 },
  title: { fontSize: 28, marginBottom: 4 },
  subtitle: { color: '#94a3b8' },
  subBadge: { color: '#a855f7', fontWeight: 700, marginTop: 6 },
  tabs: { display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 16 },
  tab: { padding: '8px 24px', background: '#1e293b', color: '#94a3b8', border: 'none', cursor: 'pointer', fontWeight: 600 },
  activeTab: { background: '#f97316', color: '#fff' },
  methodRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
  methodBtn: { padding: '6px 14px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, cursor: 'pointer' },
  activeMethod: { background: '#0070ba', color: '#fff', borderColor: '#0070ba' },
  cardForm: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 700, margin: '0 auto 16px', padding: 12, background: '#1e293b', borderRadius: 8 },
  stripeBox: { maxWidth: 500, margin: '0 auto 16px', padding: 16, background: '#1e293b', borderRadius: 8, border: '1px solid #334155' },
  input: { padding: 8, background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: 4 },
  error: { padding: 10, background: '#7f1d1d', borderRadius: 6, marginBottom: 16, textAlign: 'center', maxWidth: 700, margin: '0 auto 16px' },
  info: { padding: 10, background: '#064e3b', borderRadius: 6, marginBottom: 16, textAlign: 'center', maxWidth: 700, margin: '0 auto 16px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, maxWidth: 1100, margin: '0 auto' },
  card: { background: '#1e293b', padding: 16, borderRadius: 8, textAlign: 'center', border: '1px solid #334155' },
  eliteCard: { borderColor: '#a855f7', background: 'linear-gradient(135deg, #1e293b, #2e1065)' },
  tokenAmt: { fontSize: 22, fontWeight: 700, margin: '8px 0' },
  price: { fontSize: 18, color: '#10b981', marginBottom: 12 },
  buyBtn: { padding: '8px 20px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, width: '100%' },
  histRow: { display: 'flex', alignItems: 'center', padding: 12, background: '#1e293b', borderRadius: 8, marginBottom: 8, border: '1px solid #334155' },
  refundBtn: { padding: '6px 12px', background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
};
