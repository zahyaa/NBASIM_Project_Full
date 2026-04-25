require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

// In test mode, the test harness manages the DB connection (mongodb-memory-server)
// and never starts an HTTP listener.
const isTest = process.env.NODE_ENV === 'test';

if (!isTest) {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nbasim';
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => { console.error('MongoDB connection error:', err.message); process.exit(1); });
}

app.set('trust proxy', 1);

// Security headers. crossOriginResourcePolicy is relaxed so uploaded logos
// served from /api/upload/file/* can be embedded by the client on a different port.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// CORS: allow only the configured client origin(s). Comma-separated list supported.
// CRA's dev proxy (http-proxy-middleware with changeOrigin) rewrites the Origin
// header to the backend's own host, so we include both the client and server
// localhost origins by default in development.
const defaultOrigins = process.env.NODE_ENV === 'production'
  ? ''
  : 'http://localhost:3000,http://localhost:5001';
const allowedOrigins = (process.env.CORS_ORIGIN || defaultOrigins)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

const gameRoutes = require('./routes/games');
const authRoutes = require('./routes/auth');
const nbaRoutes = require('./routes/nba');
const draftRoutes = require('./routes/draft');
const simulateRoutes = require('./routes/simulate');
const settingsRoutes = require('./routes/settings');
const uploadRoutes = require('./routes/upload');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Looser limit outside production so dev/E2E test loops aren't blocked.
  max: process.env.NODE_ENV === 'production' ? 20 : 500,
  message: { error: 'Too many requests, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate-limit only credential-bearing endpoints, not /me
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/games', gameRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/nba', nbaRoutes);
app.use('/api/draft', draftRoutes);
app.use('/api/simulate', simulateRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/upload', uploadRoutes);

const PORT = process.env.PORT || 5001;
if (!isTest) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
