require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nbasim';
mongoose.connect(MONGODB_URI);

app.use(cors());
app.use(express.json());

const gameRoutes = require('./routes/games');
const authRoutes = require('./routes/auth');
const nbaRoutes = require('./routes/nba');
const draftRoutes = require('./routes/draft');
const simulateRoutes = require('./routes/simulate');

app.use('/api/games', gameRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/nba', nbaRoutes);
app.use('/api/draft', draftRoutes);
app.use('/api/simulate', simulateRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
