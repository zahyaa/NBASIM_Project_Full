require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nbasim';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => { console.error('MongoDB connection error:', err.message); process.exit(1); });

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

const gameRoutes = require('./routes/games');
const authRoutes = require('./routes/auth');
const nbaRoutes = require('./routes/nba');
const draftRoutes = require('./routes/draft');
const simulateRoutes = require('./routes/simulate');
const settingsRoutes = require('./routes/settings');
const uploadRoutes = require('./routes/upload');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, try again later' },
});

app.use('/api/games', gameRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/nba', nbaRoutes);
app.use('/api/draft', draftRoutes);
app.use('/api/simulate', simulateRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/upload', uploadRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
